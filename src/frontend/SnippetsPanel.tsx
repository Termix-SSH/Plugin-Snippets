import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useHosts,
  usePermission,
  usePluginApi,
  useSettings,
  useTranslation,
  type PanelProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  ExternalLink,
  FolderPlus,
  MoreHorizontal,
  Code2,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  AddButton,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  PanelList,
  PanelSearch,
  copyToClipboard,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { createSnippetsApi } from "./snippets-api";
import { useSnippetRunner, type TargetHost } from "./use-snippet-runner";
import {
  TargetTerminals,
  toRunTargets,
  useOpenTerminals,
} from "./TargetTerminals";
import { SnippetShareView, type ShareTarget } from "./SnippetShareView";
import { SnippetEditor, type SnippetFormValues } from "./SnippetEditor";
import { SnippetSettings } from "./SnippetSettings";
import { readSnippetSettings } from "./settings";
import {
  SnippetFolderDialog,
  type FolderFormValues,
} from "./SnippetFolderDialog";
import { SnippetFolderRow, SnippetRow, type DropPosition } from "./SnippetTree";
import {
  errorMessage,
  parseHostFilter,
  type Snippet,
  type SnippetFolder,
} from "./types";
import { docsUrl } from "./docs";

const DOCS_URL = docsUrl();

type View =
  | { kind: "list" }
  | { kind: "edit"; snippet: Snippet | null; folder?: string }
  | { kind: "settings" }
  | { kind: "share"; target: ShareTarget };

interface FolderGroup {
  name: string;
  folder: SnippetFolder | null;
  snippets: Snippet[];
}

function matchesQuery(snippet: Snippet, query: string): boolean {
  return (
    snippet.name.toLowerCase().includes(query) ||
    (snippet.description ?? "").toLowerCase().includes(query) ||
    snippet.content.toLowerCase().includes(query)
  );
}

export function SnippetsPanel({ targetTab }: PanelProps) {
  const { t } = useTranslation();
  const api = usePluginApi();
  const client = useMemo(() => createSnippetsApi(api), [api]);
  const canView = usePermission("view");
  const canCreate = usePermission("create");
  const canEdit = usePermission("edit");
  const canDelete = usePermission("delete");
  const canShare = usePermission("share");
  const settings = useSettings("user");
  const display = readSnippetSettings(settings.values);
  const {
    runSnippet,
    runOnActive,
    runOnHosts,
    dialog: runnerDialog,
  } = useSnippetRunner(display.confirmExecution);
  const openTerminals = useOpenTerminals();
  const [selectedTerminals, setSelectedTerminals] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    setSelectedTerminals((prev) => {
      const open = new Set(openTerminals.map((terminal) => terminal.id));
      const next = new Set([...prev].filter((id) => open.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [openTerminals]);
  const { hosts } = useHosts();
  const confirm = useConfirm();

  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [folders, setFolders] = useState<SnippetFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>({ kind: "list" });
  // Folders the user opened or closed by hand; the rest follow the setting.
  const [folderOverrides, setFolderOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [folderDialog, setFolderDialog] = useState<{
    folder: SnippetFolder | null;
    /** The name being edited, set even when the folder has no metadata row. */
    editName: string | null;
  } | null>(null);
  const [dragged, setDragged] = useState<Snippet | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: number;
    position: DropPosition;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importOverwriteRef = useRef(false);

  const hostsById = useMemo(
    () => new Map(hosts.map((host) => [Number(host.id), host])),
    [hosts],
  );

  function targetHostsOf(snippet: Snippet): TargetHost[] {
    if (snippet.isNote) return [];
    return parseHostFilter(snippet.hostFilter).flatMap((id) => {
      const host = hostsById.get(id);
      return host
        ? [
            {
              id,
              name: host.name,
              ip: host.ip,
              username: host.username,
              port: host.port,
            },
          ]
        : [];
    });
  }

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      const [snippetList, folderList] = await Promise.all([
        client.list(),
        client.listFolders(),
      ]);
      setSnippets(Array.isArray(snippetList) ? snippetList : []);
      setFolders(Array.isArray(folderList) ? folderList : []);
    } catch (err) {
      toast.error(errorMessage(err, t("loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [canView, client, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const query = search.trim().toLowerCase();

  const { groups, rootSnippets } = useMemo(() => {
    const byFolder = new Map<string, FolderGroup>();
    for (const folder of folders) {
      byFolder.set(folder.name, {
        name: folder.name,
        folder,
        snippets: [],
      });
    }
    const root: Snippet[] = [];
    for (const snippet of snippets) {
      if (query && !matchesQuery(snippet, query)) continue;
      if (!snippet.folder) {
        root.push(snippet);
        continue;
      }
      const group = byFolder.get(snippet.folder) ?? {
        name: snippet.folder,
        folder: null,
        snippets: [],
      };
      group.snippets.push(snippet);
      byFolder.set(snippet.folder, group);
    }
    const sorted = Array.from(byFolder.values())
      .filter((group) => !query || group.snippets.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { groups: sorted, rootSnippets: root };
  }, [folders, snippets, query]);

  const folderNames = useMemo(
    () =>
      Array.from(
        new Set([
          ...folders.map((f) => f.name),
          ...snippets.flatMap((s) => (s.folder ? [s.folder] : [])),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [folders, snippets],
  );

  function isOpen(name: string): boolean {
    if (query) return true;
    return folderOverrides.get(name) ?? !display.foldersCollapsed;
  }

  function toggleFolder(name: string) {
    setFolderOverrides((prev) => {
      const next = new Map(prev);
      next.set(name, !isOpen(name));
      return next;
    });
  }

  function setAllFolders(open: boolean) {
    setFolderOverrides(new Map(folderNames.map((name) => [name, open])));
  }

  async function handleSaveSnippet(values: SnippetFormValues) {
    if (view.kind !== "edit") return false;
    const body = {
      name: values.name.trim(),
      content: values.content.trim(),
      description: values.description.trim() || null,
      folder: values.folder || null,
      isNote: values.isNote,
      hostFilter:
        !values.isNote && values.hostIds.length > 0 ? values.hostIds : null,
    };
    const editing = view.snippet;
    try {
      if (editing) {
        await client.update(editing.id, body);
        toast.success(t("updateSuccess"));
      } else {
        await client.create(body);
        toast.success(t("createSuccess"));
      }
      if (body.folder) {
        setFolderOverrides((prev) => new Map(prev).set(body.folder!, true));
      }
      setView({ kind: "list" });
      await load();
      return true;
    } catch (err) {
      toast.error(
        errorMessage(err, t(editing ? "updateFailed" : "createFailed")),
      );
      return false;
    }
  }

  function handleRun(snippet: Snippet) {
    const targets = targetHostsOf(snippet);
    const terminalTargets = toRunTargets(openTerminals, selectedTerminals);
    if (targets.length > 0 && !snippet.isNote) runOnHosts(snippet, targets);
    else if (terminalTargets.length > 0) runSnippet(snippet, terminalTargets);
    else
      runOnActive(
        snippet,
        targetTab?.host
          ? {
              name: targetTab.host.name,
              ip: targetTab.host.ip,
              username: targetTab.host.username,
              port: targetTab.host.port,
            }
          : null,
        targetTab?.id,
      );
  }

  function endDrag() {
    setDragged(null);
    setDropTarget(null);
  }

  // Drops the dragged snippet next to a row, taking that row's folder.
  async function handleDropOnRow(target: Snippet) {
    const source = dragged;
    const position = dropTarget?.position ?? "below";
    endDrag();
    if (!source || source.id === target.id) return;

    const folder = target.folder ?? null;
    const group = snippets.filter(
      (s) => (s.folder ?? null) === folder && s.id !== source.id,
    );
    const index = group.findIndex((s) => s.id === target.id);
    group.splice(position === "above" ? index : index + 1, 0, {
      ...source,
      folder,
    });
    await saveOrder(group, folder);
  }

  async function handleDropOnFolder(folder: string) {
    const source = dragged;
    endDrag();
    if (!source || source.folder === folder) return;
    const group = [
      ...snippets.filter((s) => s.folder === folder && s.id !== source.id),
      { ...source, folder },
    ];
    setFolderOverrides((prev) => new Map(prev).set(folder, true));
    await saveOrder(group, folder);
  }

  async function saveOrder(group: Snippet[], folder: string | null) {
    const ordered = group.map((s, order) => ({ ...s, order }));
    const byId = new Map(ordered.map((s) => [s.id, s]));
    setSnippets((prev) => {
      const rest = prev.filter((s) => !byId.has(s.id));
      return [...rest, ...ordered];
    });
    try {
      await client.reorder(
        ordered.map((s) => ({
          id: s.id,
          order: s.order,
          folder: folder ?? "",
        })),
      );
    } catch (err) {
      toast.error(errorMessage(err, t("reorderFailed")));
      await load();
    }
  }

  function handleDeleteSnippet(snippet: Snippet) {
    void confirm({
      title: t("deleteSnippetConfirm", { name: snippet.name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    }).then((ok) => {
      if (ok)
        void (async () => {
          try {
            await client.remove(snippet.id);
            toast.success(t("deleteSuccess"));
            await load();
          } catch (err) {
            toast.error(errorMessage(err, t("deleteFailed")));
          }
        })();
      return ok;
    });
  }

  async function handleMoveSnippet(snippet: Snippet, folder: string | null) {
    try {
      await client.update(snippet.id, { folder });
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t("updateFailed")));
    }
  }

  async function handleCopy(snippet: Snippet) {
    const ok = await copyToClipboard(snippet.content);
    if (ok) toast.success(t("copySuccess"));
    else toast.error(t("copyFailed"));
  }

  async function handleSaveFolder(values: FolderFormValues) {
    const editName = folderDialog?.editName ?? null;
    try {
      if (editName === null) {
        await client.createFolder(values);
        toast.success(t("folderCreateSuccess"));
      } else {
        // A folder named only on its snippets gets a metadata row first.
        if (!folderDialog?.folder) {
          await client.createFolder({ name: editName });
        }
        if (values.name !== editName) {
          await client.renameFolder(editName, values.name);
          setFolderOverrides((prev) => {
            const next = new Map(prev);
            const wasOpen = next.get(editName);
            next.delete(editName);
            if (wasOpen !== undefined) next.set(values.name, wasOpen);
            return next;
          });
        }
        await client.updateFolderMetadata(values.name, {
          color: values.color,
          icon: values.icon,
        });
        toast.success(t("folderEditSuccess"));
      }
      setFolderDialog(null);
      await load();
    } catch (err) {
      toast.error(
        errorMessage(
          err,
          t(editName === null ? "folderCreateFailed" : "folderEditFailed"),
        ),
      );
    }
  }

  function handleDeleteFolder(name: string) {
    void confirm({
      title: t("deleteFolderConfirm", { name }),
      confirmLabel: t("delete"),
      cancelLabel: t("cancel"),
    }).then((ok) => {
      if (ok)
        void (async () => {
          try {
            await client.deleteFolder(name);
            toast.success(t("folderDeleteSuccess"));
            await load();
          } catch (err) {
            toast.error(errorMessage(err, t("folderDeleteFailed")));
          }
        })();
      return ok;
    });
  }

  async function handleExport() {
    try {
      const data = await client.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "termix-snippets.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t("exportSuccess"));
    } catch (err) {
      toast.error(errorMessage(err, t("exportFailed")));
    }
  }

  async function handleImport(file: File) {
    let parsed: { snippets?: unknown; folders?: unknown };
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error(t("importInvalidFile"));
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (!Array.isArray(parsed.snippets) && !Array.isArray(parsed.folders))
    ) {
      toast.error(t("importInvalidFile"));
      return;
    }
    try {
      const result = (await client.bulkImport({
        snippets: Array.isArray(parsed.snippets) ? parsed.snippets : [],
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        overwrite: importOverwriteRef.current,
      })) as {
        snippetsImported?: number;
        snippetsUpdated?: number;
        snippetsSkipped?: number;
      };
      toast.success(
        t("importSuccess", {
          imported: result.snippetsImported ?? 0,
          updated: result.snippetsUpdated ?? 0,
          skipped: result.snippetsSkipped ?? 0,
        }),
      );
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t("importFailed")));
    }
  }

  function startImport(overwrite: boolean) {
    importOverwriteRef.current = overwrite;
    fileInputRef.current?.click();
  }

  if (!canView) {
    return null;
  }

  return renderView();

  function renderView() {
    const overlay =
      view.kind === "edit" ? (
        <SnippetEditor
          snippet={view.snippet}
          defaultFolder={view.folder}
          folders={folders}
          onBack={() => setView({ kind: "list" })}
          onSave={handleSaveSnippet}
        />
      ) : view.kind === "share" ? (
        <SnippetShareView
          target={view.target}
          client={client}
          onBack={() => setView({ kind: "list" })}
        />
      ) : view.kind === "settings" ? (
        <SnippetSettings
          settings={settings}
          onBack={() => setView({ kind: "list" })}
        />
      ) : null;

    const renderSnippet = (snippet: Snippet, index: number) => (
      <SnippetRow
        key={snippet.id}
        snippet={snippet}
        stripe={index}
        showCommand={display.showCommands}
        alwaysShowActions={display.alwaysShowActions}
        folderNames={folderNames}
        targetHostNames={targetHostsOf(snippet).map(
          (host) => host.name || host.ip || String(host.id),
        )}
        canEdit={canEdit}
        canDelete={canDelete}
        canShare={canShare}
        draggable={canEdit && !snippet.isShared && !query}
        dragActive={dragged !== null}
        isDragging={dragged?.id === snippet.id}
        dropIndicator={
          dropTarget?.id === snippet.id && dragged?.id !== snippet.id
            ? dropTarget.position
            : null
        }
        onRun={() => handleRun(snippet)}
        onCopy={() => void handleCopy(snippet)}
        onEdit={() => setView({ kind: "edit", snippet })}
        onShare={() =>
          setView({ kind: "share", target: { kind: "snippet", snippet } })
        }
        onMove={(folder) => void handleMoveSnippet(snippet, folder)}
        onDelete={() => handleDeleteSnippet(snippet)}
        onDragStart={() => setDragged(snippet)}
        onDragEnd={endDrag}
        onDragOverRow={(position) =>
          setDropTarget((prev) =>
            prev?.id === snippet.id && prev.position === position
              ? prev
              : { id: snippet.id, position },
          )
        }
        onDropRow={() => void handleDropOnRow(snippet)}
      />
    );

    const isEmpty = groups.length === 0 && rootSnippets.length === 0;

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2">
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder={t("searchPlaceholder")}
            fill
          />
          <div className="flex items-center justify-end gap-2">
            {canCreate && (
              <AddButton
                label={t("newSnippet")}
                onClick={() => setView({ kind: "edit", snippet: null })}
                className="flex-1"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  title={t("moreActions")}
                  aria-label={t("moreActions")}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48 text-xs">
                {canCreate && (
                  <DropdownMenuItem
                    onClick={() =>
                      setFolderDialog({ folder: null, editName: null })
                    }
                  >
                    <FolderPlus className="mr-2 size-3.5" />
                    {t("newFolder")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setAllFolders(true)}>
                  <ChevronsUpDown className="mr-2 size-3.5" />
                  {t("expandAll")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAllFolders(false)}>
                  <ChevronsDownUp className="mr-2 size-3.5" />
                  {t("collapseAll")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {canCreate && (
                  <>
                    <DropdownMenuItem onClick={() => startImport(false)}>
                      <Upload className="mr-2 size-3.5" />
                      {t("importSkipExisting")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => startImport(true)}>
                      <Upload className="mr-2 size-3.5" />
                      {t("importOverwrite")}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => void handleExport()}
                  disabled={snippets.length === 0}
                >
                  <Download className="mr-2 size-3.5" />
                  {t("exportSnippets")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView({ kind: "settings" })}>
                  <SlidersHorizontal className="mr-2 size-3.5" />
                  {t("settingsTitle")}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={DOCS_URL} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 size-3.5" />
                    {t("docsLink")}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <TargetTerminals
            terminals={openTerminals}
            selected={selectedTerminals}
            onChange={setSelectedTerminals}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImport(file);
            }}
          />
        </div>

        <PanelList>
          {loading ? (
            <div className="p-4 text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={Code2}
              title={t(query ? "noSearchResults" : "emptyTitle")}
              hint={query ? undefined : t("emptyDescription")}
            />
          ) : (
            <>
              {rootSnippets.map(renderSnippet)}
              {groups.map((group, index) => {
                const open = isOpen(group.name);
                return (
                  <SnippetFolderRow
                    key={group.name}
                    name={group.name}
                    folder={group.folder}
                    count={group.snippets.length}
                    open={open}
                    stripe={rootSnippets.length + index}
                    canCreate={canCreate}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canShare={canShare}
                    acceptsDrop={
                      dragged !== null && dragged.folder !== group.name
                    }
                    onToggle={() => toggleFolder(group.name)}
                    onAddSnippet={() =>
                      setView({
                        kind: "edit",
                        snippet: null,
                        folder: group.name,
                      })
                    }
                    onEdit={() =>
                      setFolderDialog({
                        folder: group.folder,
                        editName: group.name,
                      })
                    }
                    onShare={() =>
                      setView({
                        kind: "share",
                        target: { kind: "folder", name: group.name },
                      })
                    }
                    onDelete={() => handleDeleteFolder(group.name)}
                    onDropSnippet={() => void handleDropOnFolder(group.name)}
                  >
                    {open && group.snippets.map(renderSnippet)}
                  </SnippetFolderRow>
                );
              })}
              {dragged?.folder && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const source = dragged;
                    endDrag();
                    void saveOrder(
                      [
                        ...snippets.filter((s) => !s.folder),
                        { ...source, folder: null },
                      ],
                      null,
                    );
                  }}
                  className="m-2 border border-dashed border-border px-3 py-3 text-center text-[11px] text-muted-foreground"
                >
                  {t("dropToRemoveFromFolder")}
                </div>
              )}
            </>
          )}
        </PanelList>

        {folderDialog && (
          <SnippetFolderDialog
            folder={
              folderDialog.folder ??
              (folderDialog.editName
                ? ({
                    name: folderDialog.editName,
                    color: null,
                    icon: null,
                  } as SnippetFolder)
                : null)
            }
            onClose={() => setFolderDialog(null)}
            onSave={handleSaveFolder}
          />
        )}
        {runnerDialog}
        {overlay}
      </div>
    );
  }
}
