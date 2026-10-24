# Desktop call recording

The calling card has a **Record call** control. Claim the business, put the iPhone on speakerphone near the computer, confirm recording permission and press Record call. The browser asks for the computer microphone; no recording starts on page load. The active strip names the business and purpose, shows the timer and provides Stop recording even if another view is opened. Saving a call outcome waits until recording has stopped and its private save resolves.

This captures whatever the computer microphone hears. Both parties must be audible for both voices to be captured. It does not intercept an iPhone cellular connection, activate iPhone recording or read Apple Notes. Actual microphone permission, placement, room noise and both voices need an operator rehearsal before using it for a real call. The implemented browser route follows [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) and [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder); HTTPS or localhost is required.

After Stop, the clip is saved privately and appears with playback under that exact call. A failed or uncertain save retains the exact clip in the current tab, with retry and download controls; keep the tab open. A recorder error stops the microphone, retains available bytes for review and marks a manually saved clip as partial. Discard removes only this tab's copy; it does not delete a private reservation or saved history. Closing/reloading before a verified save can lose retained audio. The browser asks before leaving while audio remains active or unsaved.

If bytes were saved before their confirmation was interrupted, **Verify private audio save** checks the existing reservation, container and exact hash and finishes verification without uploading or recording again. It also works after reload. Missing or mismatched bytes remain held; no replacement is invented. Signing out stops active capture.

An uploaded recording may precede its call outcome. Its stable call ID survives a workspace refresh; History also exposes unlogged clips rather than silently attaching them to a different call. An undone call retains its audio and original IDs. A private upload does not invent a call attempt or change contact/sending rules.

## Spoken notes and transcripts

History has a separate **Record my spoken notes** control for an operator's private summary. Its audio is distinct from customer call audio and cannot be selected as customer-transcript evidence. Existing Dictate my post-call notes produces editable text; call recording must stop before dictation. Review and save that text before preparing an email revision.

Transcription is pending/manual: no new transcription provider, paid API or automatic Apple Notes import is connected. A permitted manual transcript may name selected stored call clips; the server verifies their exact call and purpose. Existing bounded transcript assessment, quote selection, human-reviewed wording and exact email release rules then apply. Private notes are not copied into customer email, uncertain claims require review, and new audio does not rewrite sent/reserved messages.

## Private storage and recovery

The server authenticates the operator and validates CSRF, project/call IDs, timestamps, permission, container type and size before reserving an audio ID. Only the trusted artifact route can record storage metadata. A reservation precedes binary storage; confirmed bytes, SHA-256, actor, purpose and times remain immutable. Exact retries converge on the same file and events. Uncertain writes retain their reservation and never overwrite another clip. Playback verifies the saved length and hash and requires the same private session. No clip bytes enter the public static site or Git.

Local audio lives under `call-audio/` in the private lifecycle directory. A fully written temporary file is linked to its immutable final ID without replacement, preventing partially written final files. Netlify uses new-only binary Blobs in the configured fictional namespace; deployed storage still needs its separate configured proof. Clips stop at twenty minutes or near 4 MB; continue with another clip when needed. Hard server ceilings are 4 MB per clip, 50 clips per Eastern day and 200 MB/2,000 clips retained across the workspace. These are conservative application guards, not a claim of hosting entitlement or capacity. No automatic deletion is introduced.

Local lifecycle backups now include verified stored audio in a sibling `<backup-file>.audio/` directory. Retain it with the JSON backup. Restore verifies every required clip before creating a new destination, refuses missing/altered/symlinked/oversized files, and restores with execution disabled. Reserved but unverified uploads remain unresolved; a backup does not turn them into a verified recording. Hosted backups, migration/retention operations and actual cloud storage remain separate acceptance work.

## Executed checks

Run `node --test call-audio.test.mjs desktop-recorder.test.mjs hosted-desk.test.mjs lifecycle-server.test.mjs`. Substituted microphone/recorder tests verify audio-only requests, permission failure, track release, stop/playback bytes and the duration cap. Actual local HTTP and stateless-handler tests verify authentication, CSRF, private binary readback, immutable retries, strong Blobs reconciliation, provenance, quotas, transcript clip binding and audio-inclusive backup/restore. Container fixtures and a generated silent WAV contain no customer speech.

The fictional browser check verifies the claim/permission guard, separate History sections and playback of that one-second generated silent WAV. It does not open a real microphone, prove acoustic quality, exercise a real business call or establish automatic transcription. The temporary browser server is stopped after the check; the installed runtime is unchanged.
