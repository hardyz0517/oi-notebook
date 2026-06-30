import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { KnowledgeSuggestionRow } from "@/lib/knowledge/knowledgeUiModel";

export function KnowledgeRelationshipView({
  suggestions,
  onOpenAsset,
}: {
  suggestions: KnowledgeSuggestionRow[];
  onOpenAsset?: (path: string) => void;
}) {
  return (
    <div className="grid gap-3">
      {suggestions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">暂无确定性关系建议。</CardContent>
        </Card>
      ) : suggestions.map((suggestion) => (
        <Card key={suggestion.id}>
          <CardHeader className="px-4 py-3">
            <div>
              <div className="text-sm font-medium">{suggestion.targetTitle}</div>
              <div className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</div>
            </div>
            <Badge variant="info">score {suggestion.score.toFixed(2)}</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs text-muted-foreground">
            <div>{suggestion.preview}</div>
            <div className="truncate">refs: {suggestion.refs.join(", ")}</div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="w-fit"
              disabled={!suggestion.action.enabled}
              onClick={() => onOpenAsset?.(suggestion.action.path)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {suggestion.action.label}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
