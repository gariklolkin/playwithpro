# OpenSpec Instructions

This project uses OpenSpec for spec-driven development. AI assistants must follow this workflow.

## Directory layout

```
openspec/
  project.md          # project context, conventions, roadmap
  specs/              # CURRENT truth — capabilities as deployed
    <capability>/spec.md
  changes/            # PROPOSED changes not yet built/archived
    <change-id>/
      proposal.md     # Why / What Changes / Impact
      tasks.md        # implementation checklist (- [ ] items)
      design.md       # technical decisions (optional, for complex changes)
      specs/<capability>/spec.md   # spec DELTAS
    archive/          # completed changes
```

## Workflow

1. **Before any non-trivial code change**, create a change folder `changes/<verb-noun-id>/` with `proposal.md`, `tasks.md`, and spec deltas. Get owner approval before implementing.
2. **Implement** following `tasks.md`, checking off items as they complete.
3. **Archive** after deployment: apply deltas into `specs/`, move the change to `changes/archive/YYYY-MM-DD-<id>/`.

## Spec delta format

Deltas use operation headers. Every requirement MUST have at least one `#### Scenario:` block.

```markdown
## ADDED Requirements
### Requirement: Slot Booking
The system SHALL prevent double-booking of a coach time slot.

#### Scenario: Slot already taken
- **WHEN** an amateur attempts to book a slot that is no longer free
- **THEN** the booking is rejected with a conflict error and the catalog view refreshes

## MODIFIED Requirements
### Requirement: <name>          # full updated text

## REMOVED Requirements
### Requirement: <name>
**Reason**: ...
```

## Conventions

- Change IDs: kebab-case, verb-led (`add-`, `update-`, `remove-`, `refactor-`).
- Requirements use SHALL/MUST language; scenarios use WHEN/THEN bullets.
- One capability per `specs/<capability>/` folder; capabilities are single-purpose (e.g. `booking`, `payments`, not `misc`).
- Keep `project.md` roadmap in sync when adding/completing changes.
