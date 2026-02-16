// ============================================================================
// TEMPLATE SELECTOR — Sélection d'un modèle de workflow prédéfini
// Galerie de templates avec aperçu et application en 1 clic
// + Génération par IA via OpenAI
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  FileCheck, Building2, Zap, Users, RefreshCcw,
  ChevronRight, Sparkles, ArrowRight, Bot, Loader2,
  GitBranch, AlertTriangle, Wand2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAuthStore } from '@/stores/authStore';
import { apiRequest } from '@/api/apiClient';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@/lib/workflowTemplates';
import { toast } from 'sonner';
import type { WorkflowDefinition } from '@/models/workflow';
import * as workflowApi from '@/api/workflowApiService';

const ICON_MAP: Record<string, React.ReactNode> = {
  FileCheck: <FileCheck className="h-5 w-5" />,
  Building2: <Building2 className="h-5 w-5" />,
  Zap: <Zap className="h-5 w-5" />,
  Users: <Users className="h-5 w-5" />,
  RefreshCcw: <RefreshCcw className="h-5 w-5" />,
};

const COMPLEXITY_COLORS = {
  simple: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  standard: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  advanced: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
};

const COMPLEXITY_LABELS = {
  simple: 'Simple',
  standard: 'Standard',
  advanced: 'Avancé',
};

const CATEGORY_LABELS = {
  validation: 'Validation',
  review: 'Revue',
  approval: 'Approbation',
  custom: 'Personnalisé',
};

const AI_PROMPT_EXAMPLES = [
  'Validation simple avec un vérificateur et décision approuvé ou rejeté',
  'Workflow BIM avec vérification géométrique, vérification réglementaire et approbation finale',
  'Revue parallèle par 3 réviseurs, puis synthèse et décision',
  'Cycle de correction : vérification, si problème retour au déposant, puis re-soumission',
];

interface TemplateSelectorProps {
  onSelect?: (template: WorkflowTemplate) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const { addDefinition, setActiveDefinition } = useWorkflowStore();
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [open, setOpen] = useState(false);

  // AI generation state
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<WorkflowDefinition | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Check AI availability on mount
  useEffect(() => {
    if (open && aiAvailable === null) {
      apiRequest<{ available: boolean }>('/ai/status')
        .then((res) => setAiAvailable(res.available))
        .catch(() => setAiAvailable(false));
    }
  }, [open, aiAvailable]);

  const handleApplyTemplate = (template: WorkflowTemplate) => {
    const { project, currentUser } = useAuthStore.getState();
    const definition = template.build(project?.id || '', currentUser?.id || '');
    addDefinition(definition);
    setActiveDefinition(definition);
    toast.success(`Template "${template.name}" appliqué`, {
      description: 'Le workflow a été créé et est prêt à être configuré.',
    });
    setOpen(false);
    onSelect?.(template);

    workflowApi.createWorkflowDefinition(definition).catch((err) => {
      console.warn('[TemplateSelector] Failed to persist template:', err);
    });
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    setAiResult(null);

    try {
      const { project, currentUser } = useAuthStore.getState();
      const result = await apiRequest<WorkflowDefinition>('/ai/generate-workflow', {
        method: 'POST',
        body: {
          prompt: aiPrompt.trim(),
          projectId: project?.id || '',
          createdBy: currentUser?.id || '',
        },
      });
      setAiResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(msg);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApplyAIResult = () => {
    if (!aiResult) return;
    addDefinition(aiResult);
    setActiveDefinition(aiResult);
    toast.success(`Workflow "${aiResult.name}" généré par IA`, {
      description: `${aiResult.nodes?.length || 0} noeuds créés. Vous pouvez le personnaliser.`,
    });
    setOpen(false);
    setAiResult(null);
    setAiPrompt('');

    workflowApi.createWorkflowDefinition(aiResult).catch((err) => {
      console.warn('[TemplateSelector] Failed to persist AI workflow:', err);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAiResult(null); setAiError(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Nouveau depuis un modèle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Créer un workflow
          </DialogTitle>
          <DialogDescription>
            Choisissez un modèle prédéfini ou décrivez votre workflow et laissez l'IA le générer.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="templates" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Modèles prédéfinis
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Générer par IA
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Templates ── */}
          <TabsContent value="templates" className="mt-4">
            <div className="grid gap-3">
              {WORKFLOW_TEMPLATES.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${
                    selectedTemplate?.id === template.id ? 'ring-2 ring-primary border-primary' : ''
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {ICON_MAP[template.icon] || <FileCheck className="h-5 w-5" />}
                        </div>
                        <div>
                          <CardTitle className="text-sm">{template.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {CATEGORY_LABELS[template.category]}
                            </Badge>
                            <Badge className={`text-[10px] px-1.5 py-0 ${COMPLEXITY_COLORS[template.complexity]}`}>
                              {COMPLEXITY_LABELS[template.complexity]}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {template.estimatedSteps} étapes
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyTemplate(template);
                        }}
                      >
                        Utiliser
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="text-xs">
                      {template.description}
                    </CardDescription>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      {template.preview}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Tab: AI Generation ── */}
          <TabsContent value="ai" className="mt-4 space-y-4">
            {aiAvailable === false ? (
              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="flex items-center gap-3 p-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Service IA non configuré</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ajoutez la variable d'environnement <code className="text-xs bg-muted px-1 rounded">OPENAI_API_KEY</code> pour activer la génération par IA.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Prompt input */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Décrivez votre workflow en langage naturel
                  </label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ex: Workflow de validation avec 2 vérificateurs en parallèle, puis un approbateur final. Si rejeté, le document est déplacé vers le dossier rejeté..."
                    rows={4}
                    className="resize-none"
                    disabled={aiGenerating}
                  />
                </div>

                {/* Prompt examples */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Exemples de prompts :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {AI_PROMPT_EXAMPLES.map((example, i) => (
                      <button
                        key={i}
                        onClick={() => setAiPrompt(example)}
                        className="text-[10px] px-2 py-1 rounded-full border bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        disabled={aiGenerating}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate button */}
                <Button
                  onClick={handleGenerateAI}
                  disabled={!aiPrompt.trim() || aiGenerating}
                  className="w-full gap-2"
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Génération en cours...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Générer le workflow
                    </>
                  )}
                </Button>

                {/* Error */}
                {aiError && (
                  <Card className="border-destructive/50 bg-destructive/5">
                    <CardContent className="flex items-center gap-2 p-3">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      <p className="text-sm text-destructive">{aiError}</p>
                    </CardContent>
                  </Card>
                )}

                {/* AI Result preview */}
                {aiResult && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="h-5 w-5 text-primary" />
                          <CardTitle className="text-sm">Workflow généré</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-[10px]">IA</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">{aiResult.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{aiResult.description}</p>
                      </div>

                      <Separator />

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-2 rounded-md bg-background">
                          <div className="text-lg font-bold text-primary">{aiResult.nodes?.length || 0}</div>
                          <div className="text-[10px] text-muted-foreground">Noeuds</div>
                        </div>
                        <div className="text-center p-2 rounded-md bg-background">
                          <div className="text-lg font-bold text-primary">{aiResult.edges?.length || 0}</div>
                          <div className="text-[10px] text-muted-foreground">Transitions</div>
                        </div>
                        <div className="text-center p-2 rounded-md bg-background">
                          <div className="text-lg font-bold text-primary">{aiResult.statuses?.length || 0}</div>
                          <div className="text-[10px] text-muted-foreground">Statuts</div>
                        </div>
                      </div>

                      {/* Node list preview */}
                      <div className="flex flex-wrap gap-1.5">
                        {(aiResult.nodes || []).map((node) => (
                          <Badge
                            key={node.id}
                            variant="outline"
                            className="text-[10px] gap-1"
                          >
                            <GitBranch className="h-2.5 w-2.5" />
                            {(node.data as any)?.label || node.type}
                          </Badge>
                        ))}
                      </div>

                      {/* Flow preview */}
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1.5 flex-wrap">
                        {(aiResult.nodes || []).map((node, i) => (
                          <React.Fragment key={node.id}>
                            {i > 0 && <ArrowRight className="h-2.5 w-2.5 shrink-0" />}
                            <span>{(node.data as any)?.label || node.type}</span>
                          </React.Fragment>
                        ))}
                      </div>

                      <Button onClick={handleApplyAIResult} className="w-full gap-2">
                        <ArrowRight className="h-4 w-4" />
                        Utiliser ce workflow
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
