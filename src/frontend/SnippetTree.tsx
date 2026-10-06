import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Check,
  ClipboardPaste,
  Copy,
  FolderInput,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Share2,
  StickyNote,
  Terminal,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  ListBadge,
  ListRow,
  ListRowAction,
  ListRowFolder,
} from "@termix-ssh/plugin-sdk/ui";
import { FolderIcon } from "./folder-icons";
import type { Snippet, SnippetFolder } from "./types";

export type DropPosition = "above" | "below";

export function SnippetRow({
  snippet,
  stripe,
  showCommand,
  folderNames,
  targetHostNames,
  canEdit,
  canDelete,
  canShare,
  draggable,
  dragActive,
  isDragging,
  dropIndicator,
  onRun,
  onCopy,
  onEdit,
  onShare,
  onMove,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
}: {
  snippet: Snippet;
  stripe: number;
  showCommand: boolean;
  folderNames: string[];
  /** Hosts a command snippet runs on directly, instead of the active terminal. */
  targetHostNames: string[];
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  draggable: boolean;
  /** True while any snippet is being dragged, so this row is a drop target. */
  dragActive: boolean;
  isDragging: boolean;
  dropIndicator: DropPosition | null;
  onRun: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onShare: () => void;
  onMove: (folder: string | null) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverRow: (position: DropPosition) => void;
  onDropRow: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(id);
  }, [copied]);
  const owned = !snippet.isShared;
  const editable = canEdit && owned;
  const deletable = canDelete && owned;
  const shareable = canShare && owned;
  const hasTargets = !snippet.isNote && targetHostNames.length > 0;
  const TypeIcon = snippet.isNote ? StickyNote : Terminal;
  const RunIcon = hasTargets ? Zap : snippet.isNote ? ClipboardPaste : Play;
  const runLabel = t(
    hasTargets ? "runOnTargets" : snippet.isNote ? "pasteToTerminal" : "run",
  );
  const copy = () => {
    onCopy();
    setCopied(true);
  };

  return (
    <ListRow
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onDragOverRow(
          e.clientY < rect.top + rect.height / 2 ? "above" : "below",
        );
      }}
      onDrop={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.stopPropagation();
        onDropRow();
      }}
      onDoubleClick={onRun}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      title={snippet.name}
      stripe={stripe}
      tone={snippet.isNote ? "muted" : "brand"}
      active={menuOpen}
      dimmed={isDragging}
      className={draggable ? "cursor-grab active:cursor-grabbing" : undefined}
      icon={<TypeIcon />}
      leading={
        <>
          {dropIndicator && (
            <div
              className={`pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-accent-brand ${dropIndicator === "above" ? "-top-px" : "-bottom-px"}`}
            />
          )}
          {draggable && (
            <div className="-mr-1.5 flex w-3.5 shrink-0 items-center justify-center text-muted-foreground/30 transition-colors group-hover/row:text-muted-foreground/70">
              <GripVertical className="size-3" />
            </div>
          )}
        </>
      }
      badges={
        <>
          {snippet.isNote && <ListBadge>{t("typeNote")}</ListBadge>}
          {snippet.isShared && (
            <ListBadge tone="brand">
              <Users />
              {t("sharedBadge")}
            </ListBadge>
          )}
        </>
      }
      meta={snippet.description || undefined}
      actions={
        <>
          <ListRowAction label={runLabel} tone="brand" onClick={onRun}>
            <RunIcon />
          </ListRowAction>
          <ListRowAction
            label={t("copyToClipboard")}
            onClick={copy}
            className={copied ? "text-accent-brand" : undefined}
          >
            {copied ? <Check /> : <Copy />}
          </ListRowAction>
          {editable && (
            <ListRowAction label={t("editSnippetTitle")} onClick={onEdit}>
              <Pencil />
            </ListRowAction>
          )}
          {shareable && (
            <ListRowAction label={t("shareSnippet")} onClick={onShare}>
              <Share2 />
            </ListRowAction>
          )}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <ListRowAction label={t("moreOptions")}>
                <MoreHorizontal />
              </ListRowAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44 text-xs">
              <DropdownMenuItem onClick={onRun}>
                <RunIcon className="mr-2 size-3.5" />
                {runLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copy}>
                <Copy className="mr-2 size-3.5" />
                {t("copyToClipboard")}
              </DropdownMenuItem>
              {editable && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 size-3.5" />
                  {t("editSnippetTitle")}
                </DropdownMenuItem>
              )}
              {shareable && (
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="mr-2 size-3.5" />
                  {t("shareSnippet")}
                </DropdownMenuItem>
              )}
              {editable && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="mr-2 size-3.5" />
                    {t("moveToFolder")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-w-72 text-xs">
                    <DropdownMenuItem
                      disabled={!snippet.folder}
                      onClick={() => onMove(null)}
                    >
                      {t("noFolder")}
                    </DropdownMenuItem>
                    {folderNames.map((name) => (
                      <DropdownMenuItem
                        key={name}
                        disabled={snippet.folder === name}
                        onClick={() => onMove(name)}
                      >
                        <span className="truncate">{name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {deletable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    {t("deleteSnippet")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {showCommand && (
        <span className="truncate font-mono text-[11px] leading-tight text-muted-foreground/60">
          {snippet.content.split("\n")[0]}
        </span>
      )}
      {hasTargets && (
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          <Zap className="size-2.5 shrink-0 text-accent-brand/70" />
          {targetHostNames.slice(0, 3).map((name) => (
            <span
              key={name}
              className="max-w-28 shrink-0 truncate bg-accent-brand/10 px-1.5 py-[1px] text-[9px] leading-[1.4] text-accent-brand"
            >
              {name}
            </span>
          ))}
          {targetHostNames.length > 3 && (
            <span className="shrink-0 text-[9px] text-muted-foreground/50">
              +{targetHostNames.length - 3}
            </span>
          )}
        </div>
      )}
    </ListRow>
  );
}

export function SnippetFolderRow({
  name,
  folder,
  count,
  open,
  stripe,
  canCreate,
  canEdit,
  canDelete,
  canShare,
  acceptsDrop,
  onToggle,
  onAddSnippet,
  onEdit,
  onShare,
  onDelete,
  onDropSnippet,
  children,
}: {
  name: string;
  /** Null for a folder that only exists as a name on its snippets. */
  folder: SnippetFolder | null;
  count: number;
  open: boolean;
  stripe: number;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  /** True while a snippet is being dragged that could move into this folder. */
  acceptsDrop: boolean;
  onToggle: () => void;
  onAddSnippet: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onDropSnippet: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const hasActions = canCreate || canEdit || canDelete || canShare;

  return (
    <ListRowFolder
      name={name}
      count={count}
      open={open}
      onToggle={onToggle}
      stripe={stripe}
      dropActive={acceptsDrop}
      onDropItem={onDropSnippet}
      emptyText={t("noSnippetsInFolder")}
      icon={
        <FolderIcon
          icon={folder?.icon}
          style={folder?.color ? { color: folder.color } : undefined}
        />
      }
      actions={
        hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ListRowAction label={t("folderActions")}>
                <MoreHorizontal />
              </ListRowAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40 text-xs">
              {canCreate && (
                <DropdownMenuItem onClick={onAddSnippet}>
                  <Plus className="mr-2 size-3.5" />
                  {t("addSnippetHere")}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 size-3.5" />
                  {t("editFolderTitle")}
                </DropdownMenuItem>
              )}
              {canShare && count > 0 && (
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="mr-2 size-3.5" />
                  {t("shareFolder")}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    {t("deleteFolder")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      {children}
    </ListRowFolder>
  );
}
