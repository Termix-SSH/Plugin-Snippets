import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "@termix/plugin-sdk/frontend";
import {
  Button,
  InlineView,
  Input,
  PanePrompt,
  useSurfaceKind,
} from "@termix/plugin-sdk/ui";
import {
  extractSnippetInputs,
  resolveSnippetContent,
  type SnippetHostContext,
} from "../shared/variables.js";

/** Enough of a snippet to fill in its inputs. */
export interface VariablesDialogSnippet {
  name: string;
  content: string;
}

/**
 * Shown before running a snippet that contains $INPUT_n placeholders:
 * collects a value per placeholder and previews the fully resolved command
 * (host vars and inputs) before handing the result back to the caller.
 */
export function SnippetVariablesDialog({
  snippet,
  host,
  onCancel,
  onConfirm,
}: {
  snippet: VariablesDialogSnippet;
  host: SnippetHostContext | null;
  onCancel: () => void;
  onConfirm: (
    resolvedContent: string,
    inputValues: Record<string, string>,
  ) => void;
}) {
  const { t } = useTranslation();
  const surface = useSurfaceKind();
  const inputs = useMemo(
    () => extractSnippetInputs(snippet.content),
    [snippet.content],
  );
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setValues({});
  }, [snippet]);

  const preview = resolveSnippetContent(snippet.content, host, values);

  const fields = (
    <div className="flex flex-col gap-4">
      {inputs.map((input) => (
        <div key={input.key} className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {input.label}
          </label>
          <Input
            autoFocus={inputs[0]?.key === input.key}
            value={values[input.key] ?? ""}
            onChange={(e) =>
              setValues((prev) => ({
                ...prev,
                [input.key]: e.target.value,
              }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm(preview, values);
            }}
          />
        </div>
      ))}
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t("variablesPreviewLabel")}
        </label>
        <span className="min-w-0 whitespace-pre-wrap break-all border border-border bg-muted/20 px-2.5 py-2 font-mono text-xs text-muted-foreground">
          {preview}
        </span>
      </div>
    </div>
  );

  const actions = (
    <>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
        onClick={() => onConfirm(preview, values)}
      >
        {t("variablesConfirmButton")}
      </Button>
    </>
  );

  const title = t("variablesDialogTitle", { name: snippet.name });

  // Started from a panel, the prompt takes over the panel. Started from a
  // keybinding or the palette, it is a card over the app.
  if (surface) {
    return (
      <InlineView
        open
        onOpenChange={(open) => !open && onCancel()}
        title={title}
        footer={<div className="ml-auto flex gap-2">{actions}</div>}
      >
        <p className="text-xs text-muted-foreground">
          {t("variablesDialogDescription")}
        </p>
        {fields}
      </InlineView>
    );
  }

  return (
    <div className="fixed inset-0 z-[150]">
      <PanePrompt
        open
        title={title}
        description={t("variablesDialogDescription")}
        onCancel={onCancel}
        actions={actions}
      >
        {fields}
      </PanePrompt>
    </div>
  );
}
