import { useEffect, useMemo, useState } from "react";
import { Copy, Zap } from "lucide-react";
import { toast } from "sonner";
import { usePluginApi, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Input,
  ListRow,
  ListRowAction,
  PanelList,
  WidgetTitle,
} from "@termix-ssh/plugin-sdk/ui";
import {
  GRID_SIZE,
  type SnippetsWidgetConfig,
  type WidgetComponentProps,
  type WidgetDefinition,
  type WidgetEditFormProps,
} from "./homepage";
import { createSnippetsApi } from "./snippets-api";
import type { Snippet } from "./types";

const DEFAULT_MAX = 8;

function SnippetsWidget({
  widget,
  config,
}: WidgetComponentProps<SnippetsWidgetConfig>) {
  const { t } = useTranslation();
  const api = usePluginApi();
  const client = useMemo(() => createSnippetsApi(api), [api]);
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);

  useEffect(() => {
    let live = true;
    client
      .list()
      .then((rows) => live && setSnippets(rows))
      .catch(() => live && setSnippets([]));
    return () => {
      live = false;
    };
  }, [client]);

  const max = config.maxItems > 0 ? config.maxItems : DEFAULT_MAX;
  const copy = async (snippet: Snippet) => {
    await navigator.clipboard.writeText(snippet.content);
    toast.success(t("widget.copied"));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle title={widget.title} icon={<Zap size={11} />} />
      {!snippets ? (
        <p className="p-3 text-xs text-muted-foreground">
          {t("widget.loading")}
        </p>
      ) : (
        <PanelList
          empty={
            <p className="p-3 text-xs text-muted-foreground">
              {t("widget.empty")}
            </p>
          }
        >
          {snippets.slice(0, max).map((snippet, index) => (
            <ListRow
              key={snippet.id}
              stripe={index}
              title={snippet.name}
              actions={
                <ListRowAction
                  label={t("widget.copy")}
                  onClick={() => void copy(snippet)}
                >
                  <Copy />
                </ListRowAction>
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}

function SnippetsWidgetEditForm({
  config,
  onChange,
}: WidgetEditFormProps<SnippetsWidgetConfig>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {t("widget.maxItems")}
      </label>
      <Input
        type="number"
        min={1}
        max={50}
        value={config.maxItems}
        onChange={(e) =>
          onChange({ ...config, maxItems: Number(e.target.value) || 1 })
        }
      />
    </div>
  );
}

/** Registered by the plugin while it runs. */
export const snippetsWidget: WidgetDefinition<SnippetsWidgetConfig> = {
  id: "snippets_widget",
  name: "Snippets",
  description: "Your saved snippets, one click to copy",
  category: "system",
  icon: <Zap size={14} />,
  defaultConfig: { maxItems: DEFAULT_MAX },
  defaultSize: { w: GRID_SIZE * 10, h: GRID_SIZE * 8 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 5 },
  components: { view: SnippetsWidget, editForm: SnippetsWidgetEditForm },
};
