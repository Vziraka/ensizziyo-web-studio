# Owner/operator business contacts

The October 19 owner correction makes finding an explicitly published professional number for the owner/operator the primary research goal. Website, social, systems and pitch findings support that goal. Assess contact completeness on every existing card, including accepted detailed research. Keep valid research, original captures, exhausted attempts and provider bindings; rerun only missing or stale contact work within a separately bounded scope.

## Evidence and card behavior

The desk distinguishes **Owner/operator direct business**, **General business line** and **Unverified number**. A named person and a shop phone on the same website do not establish a direct line. Owner identity needs an exact business-source name/role excerpt; a direct claim additionally needs an explicit public professional person-to-number link. An explicit first-name invitation can link to the fully named owner on the same business domain after source review. Confidence describes this evidence linkage, not successful connection, exclusive use of the line or current operation.

The contact-completeness view covers all cards. The existing business-phone verification flag is valid for the general-line category; it is not owner verification. Evidence older than 30 days or a changed provider-bound contact invalidates the owner-direct view until rechecked. Reviewing a retained capture preserves its original date and cannot extend source freshness. A newly found number is retained separately. Import changes only `owner_contact` and saved revision/time metadata; it cannot change research grades, calls, restrictions, follow-ups, provider contacts/tasks or release approval. Existing call permission and email holds remain independently enforced.

## Tools and cost

| Capability | Role and current boundary |
| --- | --- |
| Existing public-page collector | Up to four approved contact/about/team URLs per selected existing business, same verified business domain, public HTTPS only; retain bounded text, hashes, dates and failures. No sign-in, form submission, private-person search or autonomous cross-site expansion. |
| [Apollo People API Search](https://docs.apollo.io/reference/people-api-search) | Wired into the existing deterministic authenticated connector. Zero-credit identity search, one exact-domain query and at most five candidates per named contact capture. No model turn. It returns no phone/email; masked names and number-availability flags remain candidates. Independently match the actual business: the live pilot returned one unrelated similarly named company despite the domain filter. |
| [Apollo enrichment](https://docs.apollo.io/docs/enrich-people-data) | Not enabled by this adapter. Phone reveal uses credits and asynchronous delivery; no enrichment/reveal call or purchase is authorized by this pilot. |
| [Hunter Domain Search](https://help.hunter.io/en/articles/1922737-what-information-can-i-find-with-the-domain-search) | Optional future professional-person lead source; some person-specific professional email records may include phones. It is not guaranteed owner coverage or direct-number verification. Free allowance/account/key are not bound; no Hunter call or credit spend. |
| Business-linked social pages, [Virginia CIS](https://www.scc.virginia.gov/businesses/business-faqs/cis-faq/), professional/chamber listings | Assisted identity/contact sources with retained reviewed captures. A registered agent is not automatically the owner; a filing address or general phone is not a direct professional number. External sources are not silently added to this same-domain collector. |
| DNS/MX, urlscan, Wappalyzer, BuiltWith, Screaming Frog | Website/technical context, not owner-number discovery. Only bounded DNS/MX and archived-urlscan reads are installed; other integrations remain as described in TOOLKIT.md. |

Do not discover private personal contact details, infer numbers, or promote a broker's mobile/home-phone result into public professional contact evidence. No added recurring cost, paid model/API fallback or new provider activation. The existing 30% subscription reserve remains.

## Bounded execution

From `pipeline`, use the existing private operations directory and a separate private evidence directory outside Git:

```powershell
node owner-contact-cli.mjs audit <operations-directory> <new-audit.json>
node owner-contact-cli.mjs collect <operations-directory> <approved-plan.json> <contact-evidence-directory>
node owner-contact-cli.mjs apply <operations-directory> <reviewed-contact-packet.json>
```

An approved plan contains at most ten distinct existing card IDs, their current contact hashes and distinct version-3 capture jobs with up to four approved source URLs. This is a contact capture, not a new general-research controller attempt. The same capture ID reuses its immutable receipt instead of querying again. An unavailable source/search is explicit; no paid fallback or automatic retry. The all-card audit is read-only.

A reviewed packet binds the exact prospect/company/contact, capture job and source hashes; identifies its reviewer/date; and supplies optional exact owner and professional-phone excerpts. Inspect original text and business identity before applying. Retain the reviewed packet alongside `discovery.json`; hashes are not substitutes for semantic review. Restart/reimport of the same packet is idempotent; changed evidence under the same ID fails.

Verification: the original desk had no owner-direct classification despite verified business phones. Tests distinguish both phone-verification formats, identity versus direct access, exact source/phone binding, changed/stale contacts, first-name linkage, masked search candidates, bounded retrieval/cache reuse and preservation of stopped operational records. Browser QA must use fictional contacts and a separate loopback port; then read the installed build and live contact summaries after versioned deployment. The existing [call-desk rollout/rollback](CALL-DESK.md#verification-and-release) applies. Leave general research paused after the owner's priority correction; do not resume it merely to fill the detailed buffer.
