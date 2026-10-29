import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePluginApi, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Input,
  PasswordInput,
  SectionCard,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { isSecretName } from "../shared/variables.js";
import { createSnippetsApi, type SnippetSecret } from "./snippets-api";
import { errorMessage } from "./types";

interface Draft {
  id: number | null;
  name: string;
  value: string;
  description: string;
}

const EMPTY: Draft = { id: null, name: "", value: "", description: "" };

/**
 * The user's saved secrets for {{NAME}} in snippets. Values can be set or
 * replaced but are never shown again.
 */
export function SnippetSecretsSection() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const api = usePluginApi();
  const client = useMemo(() => createSnippetsApi(api), [api]);
  const [secrets, setSecrets] = useState<SnippetSecret[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    void client
      .listSecrets()
      .then(setSecrets)
      .catch(() => setSecrets([]));
  }, [client]);

  useEffect(reload, [reload]);

  const nameValid = draft ? isSecretName(draft.name) : false;
  const valueNeeded = draft?.id === null;
  const canSave =
    !!draft && nameValid && (!valueNeeded || draft.value.length > 0);

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      if (draft.id === null) {
        await client.createSecret({
          name: draft.name,
          value: draft.value,
          description: draft.description || null,
        });
      } else {
        await client.updateSecret(draft.id, {
          name: draft.name,
          description: draft.description || null,
          ...(draft.value ? { value: draft.value } : {}),
        });
      }
      setDraft(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, t("secrets.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (secret: SnippetSecret) => {
    const ok = await confirm({
      title: t("secrets.deleteConfirm", { name: secret.name }),
      confirmLabel: t("secrets.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await client.deleteSecret(secret.id);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, t("secrets.deleteFailed")));
    }
  };

  return (
    <SectionCard
      title={t("secrets.title")}
      icon={<KeyRound className="size-3.5" />}
    >
      <p className="px-1 pb-2 text-xs text-muted-foreground">
        {t("secrets.description", { example: "{{NAME}}" })}
      </p>
      {secrets.length === 0 && !draft && (
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          {t("secrets.empty")}
        </p>
      )}
      {secrets.map((secret) => (
        <div
          key={secret.id}
          className="flex items-center gap-2 border-b border-border px-1 py-1.5 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-sm">{`{{${secret.name}}}`}</div>
            {secret.description && (
              <div className="truncate text-xs text-muted-foreground">
                {secret.description}
              </div>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("secrets.edit")}
            title={t("secrets.edit")}
            onClick={() =>
              setDraft({
                id: secret.id,
                name: secret.name,
                value: "",
                description: secret.description ?? "",
              })
            }
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("secrets.delete")}
            title={t("secrets.delete")}
            onClick={() => void remove(secret)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {draft ? (
        <div className="flex flex-col gap-2 px-1 pt-2">
          <Input
            autoFocus
            placeholder={t("secrets.namePlaceholder")}
            value={draft.name}
            onChange={(e) =>
              setDraft({ ...draft, name: e.target.value.toUpperCase() })
            }
          />
          {draft.name && !nameValid && (
            <p className="text-xs text-destructive">
              {t("secrets.nameInvalid")}
            </p>
          )}
          <PasswordInput
            placeholder={
              draft.id === null
                ? t("secrets.valuePlaceholder")
                : t("secrets.valueKeepPlaceholder")
            }
            value={draft.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDraft({ ...draft, value: e.target.value })
            }
            autoComplete="new-password"
          />
          <Input
            placeholder={t("secrets.descriptionPlaceholder")}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              {t("secrets.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!canSave || saving}
              onClick={() => void save()}
            >
              {t("secrets.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-1 pt-2">
          <Button variant="outline" size="sm" onClick={() => setDraft(EMPTY)}>
            <Plus className="size-3.5" />
            {t("secrets.add")}
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
