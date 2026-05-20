# Health Dashboard

Dashboard personnel de suivi santé & performance. Agrège biométrie (Apple Health), nutrition, composition corporelle, journal et analyses sanguines en une interface unifiée avec insights IA.

## Stack

| Couche | Techno |
|---|---|
| Framework | Next.js 16 (App Router, RSC) |
| UI | React 19, Tailwind CSS 4, Recharts |
| Backend | Supabase (PostgreSQL, Auth) |
| IA | Anthropic Claude Haiku 4.5 (insights, corrélations, analyse repas photo) |
| Déploiement | Vercel |

## Pages

| Route | Description |
|---|---|
| `/` | Accueil — KPI du jour (recovery, strain, sommeil), brief IA, nutrition, composition corporelle, journal |
| `/nutrition` | Suivi macros par meal slots, targets ajustés aux workouts, log repas & protéines |
| `/stats` | Historique sur 7j/30j/1an — tabs Résumé, Corrélations, Recovery, Sommeil, Activité, Corps, Journal |
| `/biologie` | Résultats d'analyses sanguines, historique par marqueur, import PDF |
| `/parametres` | Config TDEE, objectif, profils de jour, meal slots, activités planifiées |

## Architecture

```
app/
├── api/
│   ├── ai-insights/       # Brief quotidien IA (tendances, recos, suggestion workout)
│   ├── ai-correlations/    # Corrélations IA 90j (cache 24h)
│   ├── ai-analysis/        # Analyse ponctuelle approfondie
│   ├── meal-log/           # CRUD meal logs
│   ├── meal-photo/         # Analyse photo repas via Claude Vision
│   ├── protein/log/        # Log protéines rapide
│   ├── planned-activities/ # Activités planifiées du jour
│   ├── stats/              # Données stats par période
│   ├── blood-tests/        # Analyses sanguines + parse PDF
│   ├── journal/            # Entrées journal (mood, energy, stress)
│   ├── config/             # Dashboard config (TDEE, objectifs)
│   └── auto-export/        # Endpoint Apple Health auto-export
├── nutrition/              # Page nutrition (RSC)
├── stats/                  # Page stats
├── biologie/               # Analyses sanguines + détail marqueur
└── parametres/             # Settings

lib/
├── dashboard-data.ts       # Moteur données accueil (agrège toutes les sources)
├── nutrition-calc.ts       # Calcul macros selon objectif (recomp/cut/bulk/maintain)
├── meal-slots.ts           # Découpage repas en créneaux, profils jour (off/muscu/surf)
├── strain-score.ts         # Score de charge (0-10) basé sur kcal actives vs baseline
├── recovery-score.ts       # Score recovery composite (HRV, FC, sommeil, respi, SpO2)
├── workout-types.ts        # Normalisation types Apple Health
├── workout-recommendation.ts # Mapping types workout → labels + icônes
├── biomarkers.ts           # Définitions marqueurs sanguins + ranges
├── journal-impact.ts       # Corrélation journal → recovery J+1
├── stats-data.ts           # Helpers charts (fill missing days, moving avg)
├── dates.ts                # Utilitaires dates (ISO, timezone Paris)
├── user-profile.ts         # Profil utilisateur pour prompts IA
└── api-usage.ts            # Tracking consommation API Anthropic

components/
├── AiInsights.tsx          # Bloc tendances + recos + suggestion workout
├── AiCorrelations.tsx      # Corrélations IA 90j avec date de génération
├── AiAnalysis.tsx          # Analyse IA approfondie
├── NutritionPageTracker.tsx # Tracker nutrition complet (macros, slots, attainment)
├── NutritionSlotView.tsx   # Vue par créneaux horaires
├── NutritionTracker.tsx    # Tracker nutrition compact (accueil)
├── StatsCharts.tsx         # Tous les charts stats (recovery, HRV, sommeil, strain, etc.)
├── PlannedActivities.tsx   # Sélecteur d'activités planifiées
├── MealPhotoAnalyzer.tsx   # Analyse photo repas
├── JournalEntry.tsx        # Saisie journal quotidien
├── StrainGauge.tsx         # Jauge visuelle de strain
└── SettingsForm.tsx        # Formulaire paramètres
```

## Systèmes clés

### Nutrition adaptative
- **Objectifs** : recomposition, cut, bulk, maintain — formules macro spécifiques
- **Meal slots** : 5 créneaux/jour avec targets proportionnels au profil du jour
- **Profils jour** : off (standard), muscu, surf — répartition macro différente
- **Ajustement temps réel** : targets recalculés selon kcal actives + workouts restants
- **Redistribution delta** : surplus/déficit des slots passés redistribué sur les futurs

### Insights IA (Claude Haiku)
- **Brief quotidien** : 3 tendances + 3 recos + suggestion workout, basé sur biométrie 7j
- **Corrélations 90j** : analyse croisée sommeil/nutrition/workout/recovery
- **Données pré-calculées** : `workoutsByDayAndType`, strain, meal slots envoyés au modèle
- **Cache** : insights 2h, corrélations 24h, invalidé par nouveau sync

### Recovery & Strain
- **Recovery score** (0-10) : composite pondéré HRV, FC repos, sommeil, respi, SpO2
- **Strain score** (0-10) : kcal actives du jour vs baseline 30j (percentile)

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
DASHBOARD_PASSWORD=
```

## Dev

```bash
npm install
npm run dev     # http://localhost:3000
```

## Déploiement

```bash
npx vercel deploy --prod
```
