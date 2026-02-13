// ============================================================================
// TEMPLATE SELECTOR — Sélection d'un modèle de workflow prédéfini
// Galerie de templates avec aperçu et application en 1 clic
// ============================================================================

import React, { useState } from 'react';
import {
  FileCheck, Building2, Zap, Users, RefreshCcw,
  ChevronRight, Sparkles, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useWorkflowStore } from '@/stores/workflowStore';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@/lib/workflowTemplates';
import { toast } from 'sonner';

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

interface TemplateSelectorProps {
  onSelect?: (template: WorkflowTemplate) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const { addDefinition, setActiveDefinition } = useWorkflowStore();
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [open, setOpen] = useState(false);

  const handleApplyTemplate = (template: WorkflowTemplate) => {
    const definition = template.build('proj-1', 'user-1');
    addDefinition(definition);
    setActiveDefinition(definition);
    toast.success(`Template "${template.name}" appliqué`, {
      description: 'Le workflow a été créé et est prêt à être configuré.',
    });
    setOpen(false);
    onSelect?.(template);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Nouveau depuis un modèle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Modèles de workflow
          </DialogTitle>
          <DialogDescription>
            Choisissez un modèle prédéfini pour démarrer rapidement. Vous pourrez le personnaliser ensuite.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-4">
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
      </DialogContent>
    </Dialog>
  );
}
