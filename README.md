**Tag Management for Language Learning Materials**

This repository contains a proof-of-concept design for a flexible, scalable tagging system to categorize language learning materials by predefined topics, vocabulary themes, and teacher-added custom tags.

---

## 📖 Background & Context

Teachers use various materials during a lesson—handouts, slides, quizzes, etc. After class, they fill out a lesson summary describing what was covered. By tagging each piece of material and/or the summary itself with standardized topics, we can:

- **Pre-fill** the summary tagging UI so teachers only need to confirm rather than type everything manually.
- **Retroactively tag** existing lessons at scale by running an AI model over past summaries or whiteboard notes.
- **Enable search** and reporting by topic (e.g., find all lessons covering the future tense or shopping vocabulary).

### Tag Types

1. **Predefined Tags** (`category: predefined`)
   - Core topics we’ve defined up front (grammar points, skills, cultural topics, etc.).
   - Starts with a typical list and can expand to include any custom tags that gain broad usage.
2. **Vocabulary Tags** (`category: vocabulary`)
   - A generic vocab tag plus a custom descriptor (e.g. `vocabulary:shopping`, `vocabulary:banking`).
   - Since vocabulary topics can be virtually anything, we keep a single `vocabulary` category and store the specific topic string.
   - Frequently used vocab themes can later be promoted into **Predefined Tags** for easier search.
3. **Custom Tags** (`category: custom`)
   - Any new topic teachers add that isn’t already in our predefined list or vocabulary patterns.

---

## 🔍 Database Schema Overview

### 1. `tags` table
Stores every tag—predefined, vocabulary, or custom.

| Column        | Type     | Description                                                     |
|---------------|----------|-----------------------------------------------------------------|
| `id` (UUID)   | UUID     | Unique tag identifier                                           |
|               |          | _e.g. the tag with name `present continuous` might have id `...`_ |
| `name`        | varchar  | Canonical label (e.g. `shopping`, `present continuous`)         |
| `category`    | enum     | `predefined` / `vocabulary` / `custom`                           |
| `created_by*` | user_id  | Optional: null for system-defined, or teacher/user who added    |

_* `created_by` is optional._

### 2. `tag_aliases` table
Maps alternate spellings or synonyms to a single canonical tag.

| Column    | Type    | Description                                                     |
|-----------|---------|-----------------------------------------------------------------|
| `alias`   | varchar | Alternate label (e.g. `present progressive`)                    |
| `tag_id`  | UUID    | FK → `tags.id`                                                  |
|           |         | _e.g. if alias = “present progressive”, tag_id points to the `present continuous` tag_ |

### 3. Extend existing `materials` table
Instead of a separate join table, we add two columns directly to the `materials` schema.

| Column        | Type    | Description                                                                                |
|---------------|---------|--------------------------------------------------------------------------------------------|
| `tag_id`      | UUID    | FK → `tags.id`; the primary tag for this material or lesson                                |
| `confidence`  | float   | 0.0–1.0 score (e.g. 1.0 if teacher-assigned, 0.5 if AI-generated); adjusts with feedback |

**Confidence meaning:**
- **AI-generated** suggestions start lower (e.g. 0.5).
- **Teacher-confirmed** tags can increase in confidence.
- **Removed** tags can decrement confidence or trigger review.

---

## ⚙️ Tagging Workflow

1. **Assigning a tag (teacher or AI):**
   - Search `tags.name` for an exact match in **predefined** or **vocabulary**.
   - If not found, search `tag_aliases.alias` to resolve to a canonical tag.
   - If still not found, create a new row in `tags` with `category = custom`.
   - Write `tag_id` and initial `confidence` into the `materials` table.

2. **Teacher review:**
   - At end of class, teachers confirm or delete suggested tags. If deleted, reduce `confidence` or flag for review.

3. **Batch consolidation:**
   - Periodically review **custom** tags:
     - Promote commonly used ones into **predefined**.
     - Add new synonyms into `tag_aliases`.
     - Update existing materials to point to the canonical `tag_id` where appropriate.

---

## 🤖 AI-Driven Tagging

- **Real-time:** NLP model analyzes new lesson summaries or whiteboard notes to auto-suggest tags.
- **Retroactive:** Bulk-process past lessons to tag materials based on summary text or annotations.
- **Interactive:** Teachers click ✅ or ❌ to confirm or reject auto-suggestions, speeding up workflow.

---

## 🔄 Integration & Next Steps

1. **Proof-of-concept:** Implement the two tables (`tags`, `tag_aliases`) and add `tag_id` + `confidence` attributes to the `materials` table in our test DB.
2. **UI demo:** Build a minimal interface or script showing:
   - Adding/removing tags.
   - Confidence adjustments on teacher actions.
3. **AI integration:** Wire in a sample ML endpoint to auto-suggest tags as teachers write summaries.
4. **Feedback loop:** Dashboard or process to merge synonyms and promote custom tags to predefined.

---

_Feedback and alternate ideas welcome!_

