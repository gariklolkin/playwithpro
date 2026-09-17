## ADDED Requirements

### Requirement: Complete email catalogs
All email copy sent by the API SHALL come from API-side ICU message catalogs in en/fr/de/ru/zh, and the `fr`, `de`, `ru`, `zh` catalogs SHALL contain exactly the same key set and ICU placeholders as `en`, enforced by an automated test.

#### Scenario: Email catalog drift
- **WHEN** a key or placeholder exists in the English email catalog but not in another
- **THEN** the API unit test suite fails
