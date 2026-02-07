# HyDE Embedding + Search Contract

Single source of truth for what goes into Qdrant and what comes out.

## Architecture

```
PDF -> Docling -> Markdown -> Agentic Chunking (Groq LLM) -> HyDE Embedding -> Qdrant
                                    |
                        [chunks.json -- inspect here]
```

**HyDE**: We embed hypothetical questions, not the chunk text itself.
Each chunk produces 8-10 questions via LLM. At query time, the user's
question matches against these question embeddings (same semantic space),
then we return the parent chunk text. Results are deduplicated by chunk_id.

---

## Chunk Schema (output of agentic_chunk)

What `chunks.json` looks like after Stage 2:

```json
{
  "chunk_id": "uuid",
  "text": "The original document text for this chunk...",
  "muscle_groups": ["rotator_cuff", "shoulders"],
  "conditions": ["impingement", "rotator cuff tear"],
  "exercises": ["external rotation", "face pull"],
  "content_type": "exercise_technique",
  "hypothetical_questions": [
    "What exercises strengthen the rotator cuff?",
    "How do I perform external rotation for shoulder rehab?",
    "What is the proper form for face pulls?",
    "..."
  ],
  "summary": "External rotation and face pull exercises for rotator cuff rehab."
}
```

---

## Metadata Types

### muscle_groups (enum, multi-select)

17 groups sourced from `shared/muscle_groups.json`:

| Key | Region |
|-----|--------|
| `neck` | Cervical muscles (scalenes, splenius, etc.) |
| `upper_back` | Trapezius, rhomboids, lats, serratus |
| `lower_back` | Erector spinae, multifidus, QL |
| `chest` | Pectoralis major/minor, subclavius |
| `shoulders` | Deltoids (anterior, lateral, posterior) |
| `rotator_cuff` | Supraspinatus, infraspinatus, teres minor/major, subscapularis |
| `biceps` | Biceps brachii, brachialis, coracobrachialis |
| `triceps` | Triceps brachii, anconeus |
| `forearms` | Wrist flexors/extensors, hand intrinsics |
| `core` | Rectus abdominis, obliques, TVA, pelvic floor |
| `hip_flexors` | Psoas, iliacus, TFL, sartorius |
| `glutes` | Glute max/med/min, piriformis, deep rotators |
| `quads` | Rectus femoris, vastus lateralis/medialis/intermedius |
| `adductors` | Adductor longus/brevis/magnus, gracilis, pectineus |
| `hamstrings` | Biceps femoris, semitendinosus, semimembranosus |
| `calves` | Gastrocnemius, soleus, foot intrinsics |
| `shins` | Tibialis anterior, peroneals/fibularis |

**Qdrant filter**: `FieldCondition(key="muscle_groups", match=MatchAny(any=["rotator_cuff"]))`

### content_type (enum, single-select)

| Value | Description |
|-------|-------------|
| `exercise_technique` | How to perform an exercise, form cues |
| `rehab_protocol` | Treatment plans, progressions, timelines |
| `pathology` | Condition descriptions, injury mechanisms |
| `assessment` | Clinical tests, ROM, strength testing |
| `anatomy` | Structural descriptions, origins/insertions |
| `training_principles` | Programming, periodization, load management |
| `reference_data` | Norms tables, ranges, statistical data |

**Qdrant filter**: `FieldCondition(key="content_type", match=MatchAny(any=["exercise_technique"]))`

### conditions (free-form, multi-value)

Lowercase clinical conditions extracted by the LLM. Examples:
`"acl tear"`, `"frozen shoulder"`, `"impingement"`, `"plantar fasciitis"`,
`"tennis elbow"`, `"lateral epicondylitis"`

**Qdrant filter**: `FieldCondition(key="conditions", match=MatchAny(any=["acl tear"]))`

### exercises (free-form, multi-value)

Lowercase exercise names extracted by the LLM. Examples:
`"bench press"`, `"squat"`, `"external rotation"`, `"nordic hamstring curl"`

**Qdrant filter**: `FieldCondition(key="exercises", match=MatchAny(any=["bench press"]))`

---

## Qdrant Point Schema (what gets stored)

Each hypothetical question becomes one point. All questions from the
same chunk share a `chunk_id`.

```
Point {
  id:     uuid            // unique per question
  vector: float[768]      // nomic-embed-text-v1.5 of the hypothetical question
  payload: {
    question:      string       // the hypothetical question (what's embedded)
    chunk_text:    string       // the original chunk text (what's returned)
    chunk_id:      string       // groups questions from the same chunk
    source:        string       // filename (e.g. "strength_and_conditioning.pdf")
    muscle_groups: string[]     // enum values from shared/muscle_groups.json
    conditions:    string[]     // free-form clinical conditions
    exercises:     string[]     // free-form exercise names
    content_type:  string       // one of the 7 content type enums
    summary:       string       // one-line chunk summary
  }
}
```

**Collection**: `physio-knowledge-base-v2`
**Embedding**: Nomic v1.5 (768d), prefixed with `search_document:` for docs, `search_query:` for queries
**Distance**: Cosine

### Payload Indexes

```
source        -> KEYWORD
muscle_groups -> KEYWORD
conditions    -> KEYWORD
exercises     -> KEYWORD
content_type  -> KEYWORD
chunk_id      -> KEYWORD
```

---

## Search Response Schema (what comes back)

After deduplication by `chunk_id` (keep highest score per chunk):

```json
{
  "id": "point-uuid",
  "chunk_id": "chunk-uuid",
  "score": 0.95,
  "text": "The original chunk text...",
  "question": "The hypothetical question that matched",
  "source": "strength_and_conditioning.pdf",
  "muscle_groups": ["rotator_cuff", "shoulders"],
  "conditions": ["impingement"],
  "exercises": ["external rotation"],
  "content_type": "exercise_technique",
  "summary": "External rotation exercises for rotator cuff rehab."
}
```

---

## Dedalus Tool Functions

The orchestrator agent calls these -- each does a single Qdrant search:

| Tool | Filters | Query Embedding |
|------|---------|-----------------|
| `search_knowledge_base(query)` | none | raw query |
| `search_by_muscle_group(group)` | `muscle_groups` | `"{group} physical therapy"` |
| `search_by_condition(condition)` | `conditions` | `"{condition} rehabilitation"` |
| `search_by_content_type(type, query)` | `content_type` | raw query |
| `search_by_exercise(exercise)` | `exercises` | `"{exercise} technique"` |
| `get_patient_muscle_context(body_id, ...)` | n/a (Convex) | n/a |

The agent decides which tools to call and how many. No internal query expansion.

---

## Pipeline CLI

```bash
# Parse + chunk (inspect before embedding)
python docs/process.py docs/raw/strength_and_conditioning.pdf

# Inspect outputs
cat docs/processed/strength_and_conditioning/parsed.md
cat docs/processed/strength_and_conditioning/chunks.json
cat docs/processed/strength_and_conditioning/manifest.json

# Happy? Push to Qdrant
python docs/process.py docs/raw/strength_and_conditioning.pdf --embed

# Parse-only (just markdown)
python docs/process.py docs/raw/my_doc.pdf --parse-only

# Re-chunk (tweak chunking without re-parsing)
python docs/process.py docs/raw/my_doc.pdf --chunk-only
```
