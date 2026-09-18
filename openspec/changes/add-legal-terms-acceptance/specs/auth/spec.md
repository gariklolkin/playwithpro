## ADDED Requirements

### Requirement: Terms acceptance at sign-up
Email registration and Google sign-up completion SHALL require an unticked checkbox by which the user accepts the current terms of service, confirms having read the privacy policy and confirms meeting the age requirement, with links to both documents. The request SHALL carry the accepted versions and the visitor's locale; the API SHALL refuse a missing or outdated version with the stable error `legal_version_outdated` and SHALL record the acceptances in the same transaction that creates the user, with the visitor's locale — which also becomes the account's locale. A professional registration SHALL additionally link to the coach agreement.

#### Scenario: Registration without the checkbox
- **WHEN** a visitor submits the registration form without ticking the box
- **THEN** the form does not submit and explains that acceptance is required

#### Scenario: Direct request without versions
- **WHEN** a client calls the registration endpoint without the accepted versions
- **THEN** the request is refused with `legal_version_outdated` and no account is created

#### Scenario: Locale recorded
- **WHEN** a visitor registers from the French site
- **THEN** the acceptance rows carry `fr` and the account's locale is `fr`

#### Scenario: Google sign-up completion
- **WHEN** a Google user completes sign-up choosing a role
- **THEN** the same checkbox is required and the rows carry the Google-completion context
