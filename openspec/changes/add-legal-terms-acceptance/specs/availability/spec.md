## ADDED Requirements

### Requirement: Re-acceptance gate on publishing availability
Changing availability rules or slots SHALL be subject to the re-acceptance gate of the legal-documents capability for the terms and, once the coach has submitted for verification, the coach agreement; reading availability SHALL never be gated.

#### Scenario: Stale coach agreement
- **WHEN** a coach whose coach-agreement acceptance is stale saves availability rules
- **THEN** the request is refused with `legal_reacceptance_required`
