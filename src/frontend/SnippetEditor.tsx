import { useMemo, useState } from "react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Code2, FileText, Server, Zap } from "lucide-react";
import {
  Checkbox,
  FormFooter,
  InlineView,
  Input,
  PanelSearch,
  SectionCard,
  Select2,
  Textarea,
} from "@termix-ssh/plugin-sdk/ui";
import { parseHostFilter, type Snippet, type SnippetFolder } from "./types";

export interface SnippetFormValues {
  name: string;
  content: string;
  description: string;
  folder: string;
  isNote: boolean;
  hostIds: number[];
}

const labelClass =
  "text-[10px] font-bold uppercase tracking-widest text-muted-foreground";

export function SnippetEditor({
  snippet,
  defaultFolder,
  folders,
  onBack,
  onSave,
}: {
  /** The snippet being edited, or null to create one. */
  snippet: Snippet | null;
  defaultFolder?: string;
  folders: SnippetFolder[];
  onBack: () => void;
  onSave: (values: SnippetFormValues) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [initial] = useState<SnippetFormValues>(() => ({
    name: snippet?.name ?? "",
    content: snippet?.content ?? "",
    description: snippet?.description ?? "",
    folder: snippet?.folder ?? defaultFolder ?? "",
    isNote: snippet?.isNote ?? false,
    hostIds: parseHostFilter(snippet?.hostFilter),
  }));
  const [values, setValues] = useState<SnippetFormValues>(initial);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const { hosts } = useHosts();
  const [hostSearch, setHostSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof SnippetFormValues>(
    key: K,
    value: SnippetFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const canSave = !!values.name.trim() && !!values.content.trim() && !saving;
  // A snippet can point at a folder that has no metadata row yet.
  const folderNames = Array.from(
    new Set([
      ...folders.map((f) => f.name),
      ...(values.folder ? [values.folder] : []),
    ]),
  ).sort((a, b) => a.localeCompare(b));

  const hostQuery = hostSearch.trim().toLowerCase();
  const visibleHosts = useMemo(
    () =>
      hosts
        .filter(
          (host) =>
            !hostQuery ||
            host.name.toLowerCase().includes(hostQuery) ||
            host.ip.toLowerCase().includes(hostQuery),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [hosts, hostQuery],
  );

  function toggleHost(id: number) {
    set(
      "hostIds",
      values.hostIds.includes(id)
        ? values.hostIds.filter((h) => h !== id)
        : [...values.hostIds, id],
    );
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlineView
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<Code2 className="size-4" />}
      title={t(snippet ? "editSnippetTitle" : "createSnippetTitle")}
      status={snippet?.name}
      footer={
        <FormFooter
          dirty={dirty}
          saving={saving}
          disabled={!canSave}
          onCancel={onBack}
          onSave={() => void handleSave()}
          saveLabel={t(snippet ? "saveSnippetButton" : "createSnippetButton")}
        />
      }
    >
      <SectionCard
        title={t(snippet ? "editSnippetTitle" : "createSnippetTitle")}
        icon={<FileText className="size-3.5" />}
      >
        <div className="flex flex-col gap-4 py-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>
              {t("nameLabel")} <span className="text-accent-brand">*</span>
            </label>
            <Input
              autoFocus
              value={values.name}
              placeholder={t("namePlaceholder")}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t("descriptionLabel")}</label>
            <Input
              value={values.description}
              placeholder={t("descriptionPlaceholder")}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t("folderLabel")}</label>
            <Select2
              value={values.folder}
              onChange={(e) => set("folder", e.target.value)}
            >
              <option value="">{t("noFolder")}</option>
              {folderNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select2>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t("typeLabel")}</label>
            <div className="flex items-stretch border border-border">
              {[false, true].map((isNote) => (
                <button
                  key={String(isNote)}
                  type="button"
                  onClick={() => set("isNote", isNote)}
                  className={`flex-1 h-8 text-xs transition-colors ${isNote ? "border-l border-border" : ""} ${
                    values.isNote === isNote
                      ? "bg-accent-brand/10 text-accent-brand"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  {t(isNote ? "typeNote" : "typeCommand")}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {t(values.isNote ? "typeNoteHint" : "typeCommandHint")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>
              {t(values.isNote ? "noteLabel" : "commandLabel")}{" "}
              <span className="text-accent-brand">*</span>
            </label>
            <Textarea
              value={values.content}
              placeholder={t(
                values.isNote ? "notePlaceholder" : "commandPlaceholder",
              )}
              onChange={(e) => set("content", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleSave();
                }
              }}
              className="min-h-36 resize-y font-mono text-xs"
            />
            <span className="text-[10px] text-muted-foreground/70 font-mono">
              {t("variablesHint")}
            </span>
          </div>
        </div>
      </SectionCard>

      {!values.isNote && (
        <SectionCard
          title={t("targetHostsLabel")}
          icon={<Zap className="size-3.5" />}
          action={
            values.hostIds.length > 0 ? (
              <button
                type="button"
                onClick={() => set("hostIds", [])}
                className="text-[10px] text-accent-brand hover:underline"
              >
                {t("clearTargetHosts")}
              </button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-2 py-3">
            <span className="text-[11px] text-muted-foreground">
              {t("targetHostsHint")}
            </span>
            {hosts.length === 0 ? (
              <span className="text-[11px] text-muted-foreground/60">
                {t("noHostsAvailable")}
              </span>
            ) : (
              <div className="flex flex-col border border-border">
                <div className="border-b border-border p-1.5">
                  <PanelSearch
                    value={hostSearch}
                    onChange={setHostSearch}
                    placeholder={t("searchHosts")}
                    fill
                  />
                </div>
                <div className="flex flex-col max-h-48 overflow-y-auto">
                  {visibleHosts.map((host) => {
                    const id = Number(host.id);
                    const selected = values.hostIds.includes(id);
                    return (
                      <button
                        key={host.id}
                        type="button"
                        onClick={() => toggleHost(id)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 text-left border-b border-border/40 last:border-b-0 transition-colors ${
                          selected
                            ? "bg-accent-brand/[0.07]"
                            : "hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <Server className="size-3 shrink-0 text-muted-foreground/60" />
                        <span className="text-xs font-medium truncate flex-1">
                          {host.name || host.ip}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60 font-mono truncate shrink-0 max-w-[45%]">
                          {host.ip}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </InlineView>
  );
}
