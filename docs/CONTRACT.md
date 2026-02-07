# Template-Wrapped Chunk Embedding + Search Contract

Single source of truth for what goes into Qdrant and what comes out.

## Architecture

```
PDF -> PyMuPDF -> Markdown -> Agentic Chunking (Groq LLM) -> Template-Wrap per content_type -> Embed -> Qdrant
                                    |
                        [chunks.json -- inspect here]
```

**Template-wrapped embedding**: Each chunk's text is wrapped in a content_type-specific
template before embedding. The template adds semantic context about *what kind* of
content the chunk is (exercise technique, pathology, anatomy, etc.), so the vector
captures the role of the content -- not just what it says. Raw text (without template)
is stored in the payload for retrieval. 1 vector per chunk. At query time, normal
`embed_query()` with Nomic's `search_query:` prefix.

---

## Embedding Templates

Each `content_type` wraps the chunk text differently before embedding:

| content_type | Template prefix |
|---|---|
| `exercise_technique` | "Exercise technique and execution. Proper form, posture, and movement cues." |
| `rehab_protocol` | "Rehabilitation protocol and treatment progression. Recovery phases, criteria, and therapeutic interventions." |
| `pathology` | "Clinical condition and diagnosis. Injury mechanism, signs and symptoms, assessment findings." |
| `assessment` | "Clinical assessment and diagnostic testing. Physical examination procedure, patient instructions, and interpretation." |
| `anatomy` | "Anatomical structure and function. Muscle origins, insertions, innervation, and biomechanical role." |
| `training_principles` | "Training and programming principles. Load management, periodization, and evidence-based guidelines." |
| `reference_data` | "Reference data and normative values. Clinical benchmarks, measurement standards, and statistical ranges." |

Unknown content types get no prefix (raw text only).

---

## Chunk Schema (output of agentic_chunk)

What `chunks.json` looks like after Stage 2:

```json
{
  "text": "The original document text for this chunk...",
  "muscle_groups": ["rotator_cuff", "shoulders"],
  "conditions": ["impingement", "rotator cuff tear"],
  "exercises": ["external rotation", "face pull"],
  "content_type": "exercise_technique",
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

One point per chunk. The vector is the embedding of the template-wrapped text;
the payload stores the raw text.

```
Point {
  id:     uuid            // unique per chunk
  vector: float[768]      // nomic-embed-text-v1.5 of template-wrapped chunk text
  payload: {
    text:          string       // the raw chunk text (what's returned)
    source:        string       // filename (e.g. "strength_and_conditioning.pdf")
    muscle_groups: string[]     // enum values from shared/muscle_groups.json
    conditions:    string[]     // free-form clinical conditions
    exercises:     string[]     // free-form exercise names
    content_type:  string       // one of the 7 content type enums
    summary:       string       // one-line chunk summary
  }
}
```

**Collection**: `physio-knowledge-base-v3`
**Embedding**: Nomic v1.5 (768d), prefixed with `search_document:` for docs, `search_query:` for queries
**Distance**: Cosine

### Payload Indexes

```
source        -> KEYWORD
muscle_groups -> KEYWORD
conditions    -> KEYWORD
exercises     -> KEYWORD
content_type  -> KEYWORD
```

---

## Search Response Schema (what comes back)

1:1 point-to-chunk, no deduplication needed:

```json
{
  "id": "point-uuid",
  "score": 0.95,
  "text": "The original chunk text...",
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
