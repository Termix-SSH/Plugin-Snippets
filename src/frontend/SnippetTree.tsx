import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Check,
  ChevronRight,
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
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import { FolderIcon } from "./folder-icons";
import type { Snippet, SnippetFolder } from "./types";

const actionButtonClass =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export type DropPosition = "above" | "below";

export function SnippetRow({
  snippet,
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

  return (
    <div
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
      title={t("doubleClickToRun")}
      className={`group relative flex flex-col gap-2 border bg-background p-2.5 select-none transition-colors ${
        menuOpen ? "border-accent-brand/40" : "border-border"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {dropIndicator && (
        <div
          className={`absolute left-0 right-0 h-0.5 bg-accent-brand z-10 pointer-events-none ${dropIndicator === "above" ? "-top-[5px]" : "-bottom-[5px]"}`}
        />
      )}
      <div className="flex min-w-0 items-start gap-1.5">
        {draggable && (
          <GripVertical className="mt-0.5 size-3 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70" />
        )}
        <TypeIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 break-words text-xs font-semibold">
              {snippet.name}
            </span>
            {snippet.isNote && (
              <span className="shrink-0 border border-border bg-muted/40 px-1 py-px text-[9px] uppercase leading-none tracking-wider text-muted-foreground">
                {t("typeNote")}
              </span>
            )}
            {snippet.isShared && (
              <span className="flex shrink-0 items-center gap-0.5 border border-accent-brand/30 bg-accent-brand/10 px-1 py-px text-[9px] uppercase leading-none tracking-wider text-accent-brand">
                <Users className="size-2.5" />
                {t("sharedBadge")}
              </span>
            )}
          </div>
          {snippet.description && (
            <span className="break-words text-xs text-muted-foreground">
              {snippet.description}
            </span>
          )}
        </div>
      </div>

      {showCommand && (
        <span className="line-clamp-3 min-w-0 whitespace-pre-wrap break-all px-1 font-mono text-xs text-muted-foreground">
          {snippet.content}
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

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          title={runLabel}
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          className="h-7 min-w-0 flex-1 gap-1.5 text-xs"
        >
          <RunIcon className="size-3 shrink-0" />
          <span className="truncate">{runLabel}</span>
        </Button>
        <button
          title={t("copyToClipboard")}
          aria-label={t("copyToClipboard")}
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
            setCopied(true);
          }}
          className={`${actionButtonClass} ${copied ? "text-accent-brand" : ""}`}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
        {editable && (
          <button
            title={t("editSnippetTitle")}
            aria-label={t("editSnippetTitle")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className={actionButtonClass}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {shareable && (
          <button
            title={t("shareSnippet")}
            aria-label={t("shareSnippet")}
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className={actionButtonClass}
          >
            <Share2 className="size-3.5" />
          </button>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              title={t("moreOptions")}
              aria-label={t("moreOptions")}
              onClick={(e) => e.stopPropagation()}
              className={actionButtonClass}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs min-w-44">
            <DropdownMenuItem onClick={onRun}>
              <RunIcon className="size-3.5 mr-2" />
              {runLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}>
              <Copy className="size-3.5 mr-2" />
              {t("copyToClipboard")}
            </DropdownMenuItem>
            {editable && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5 mr-2" />
                {t("editSnippetTitle")}
              </DropdownMenuItem>
            )}
            {shareable && (
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="size-3.5 mr-2" />
                {t("shareSnippet")}
              </DropdownMenuItem>
            )}
            {editable && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="size-3.5 mr-2" />
                  {t("moveToFolder")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="text-xs max-w-72">
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
                  <Trash2 className="size-3.5 mr-2" />
                  {t("deleteSnippet")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function SnippetFolderRow({
  name,
  folder,
  count,
  open,
  stripeIndex,
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
  stripeIndex: number;
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
  const [dragOver, setDragOver] = useState(false);
  const hasActions = canCreate || canEdit || canDelete || canShare;

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        onDragOver={(e) => {
          if (!acceptsDrop) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          if (!acceptsDrop) return;
          e.preventDefault();
          setDragOver(false);
          onDropSnippet();
        }}
        className={`group/folder flex items-center gap-2 w-full pl-2.5 pr-2 py-1.5 cursor-pointer select-none transition-colors ${
          open ? "bg-muted/40" : "hover:bg-muted/30"
        } ${stripeIndex % 2 === 1 && !open ? "bg-muted/[0.08]" : ""} ${
          dragOver && acceptsDrop
            ? "ring-1 ring-inset ring-accent-brand bg-accent-brand/10"
            : ""
        }`}
      >
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <FolderIcon
          icon={folder?.icon}
          className={`size-4 shrink-0 ${folder?.color ? "" : open ? "text-accent-brand" : "text-muted-foreground/70"}`}
          style={folder?.color ? { color: folder.color } : undefined}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground tracking-tight">
          {name}
        </span>
        <span className="text-[10px] tabular-nums shrink-0 px-1.5 py-[1px] bg-muted/70 text-muted-foreground/70">
          {count}
        </span>
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title={t("folderActions")}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center size-5 shrink-0 text-muted-foreground/60 hover:text-foreground hover:bg-muted opacity-0 group-hover/folder:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 data-[state=open]:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs min-w-40">
              {canCreate && (
                <DropdownMenuItem onClick={onAddSnippet}>
                  <Plus className="size-3.5 mr-2" />
                  {t("addSnippetHere")}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-3.5 mr-2" />
                  {t("editFolderTitle")}
                </DropdownMenuItem>
              )}
              {canShare && count > 0 && (
                <DropdownMenuItem onClick={onShare}>
                  <Share2 className="size-3.5 mr-2" />
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
                    <Trash2 className="size-3.5 mr-2" />
                    {t("deleteFolder")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open && (
        <div className="ml-[13px] flex flex-col gap-2 border-l border-border/50 py-2 pl-2">
          {count === 0 ? (
            <div className="px-1 text-[11px] text-muted-foreground/60">
              {t("noSnippetsInFolder")}
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
