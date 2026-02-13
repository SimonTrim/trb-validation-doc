# Validation Documentaire — Extension Trimble Connect

Extension pour Trimble Connect for Browser permettant la validation documentaire avec workflow designer visuel, système de visa multi-utilisateur et suivi des statuts.

## Fonctionnalités

- **Workflow Designer** — Éditeur visuel drag-and-drop (React Flow) pour créer des workflows de validation personnalisés, réutilisable pour d'autres types de workflows
- **Suivi de documents** — DataTable avancée avec filtrage par statut, tri, pagination
- **Système de visa** — Validation multi-utilisateur avec décisions : Approuvé, Commenté, Rejeté, VAO, VAO Bloquantes, VSO
- **Dashboard** — Vue d'ensemble avec statistiques et répartition par statut
- **Notifications** — Commentaires et alertes automatiques
- **Déplacement automatique** — Les documents validés sont déplacés vers un dossier cible

## Statuts de validation

| Statut | Description |
|--------|-------------|
| En attente | Document déposé, en attente de traitement |
| Approuvé | Document validé sans réserve |
| Commenté | Document commenté, modifications attendues |
| Rejeté | Document rejeté |
| VAO | Validé avec observations |
| VAO Bloquantes | Visa avec observations bloquantes |
| VSO | Visa sans observation |
| Refusé | Définitivement refusé |

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | React 18 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS (tokens Trimble/Modus) |
| Workflow Editor | React Flow (@xyflow/react) |
| State | Zustand |
| Data Table | TanStack Table |
| Backend | Node.js + Express (Vercel Serverless) |
| BDD | Turso/SQLite (serverless) |

## Démarrage rapide

```bash
# Installer les dépendances
npm install

# Lancer en développement
npm run dev

# Build de production
npm run build

# Lancer le backend proxy
npm run dev:backend
```

## Configuration

1. Copier `.env.example` vers `.env`
2. Renseigner les identifiants Trimble Connect et Turso
3. Mettre à jour les URLs dans `public/manifest.json`

## Installation dans Trimble Connect

1. Ouvrir un projet Trimble Connect
2. Aller dans **Paramètres** > **Extensions**
3. Cliquer **Ajouter une extension personnalisée**
4. Coller l'URL : `https://your-domain.com/manifest.json`

## Structure du projet

```
src/
├── api/                    # Services API (Workspace API, backend)
├── components/
│   ├── dashboard/          # Vue d'ensemble + statistiques
│   ├── documents/          # Liste, détails, badges de statut
│   ├── layout/             # Sidebar collapsible + layout principal
│   ├── ui/                 # Composants shadcn/ui
│   ├── visa/               # Panneau de visa/review
│   └── workflow/           # Workflow Designer (React Flow)
│       └── nodes/          # Noeuds custom (Start, Status, Decision, Action, Review, End)
├── lib/                    # Utilitaires
├── models/                 # Types TypeScript
└── stores/                 # State Zustand
api/                        # Backend proxy (Vercel Serverless)
public/                     # Fichiers statiques + manifest TC
```
