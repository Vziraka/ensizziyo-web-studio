# Working instructions

- Read BRIEF.md and TASKS.md before implementation. Use WORKFLOW.md for delivery and TOOLKIT.md to select relevant capabilities. Keep WORKSPACE.md links current.
- Deliver the agreed scope in complete, verifiable increments. Preserve design quality and consider the roadmap when choosing architecture. Add dependencies and skills when they improve capability, reliability, maintainability, or delivery; explain material tradeoffs.
- Show working previews early. Explain decisions and verification in plain language.
- Work on a short-lived feature, fix, or documentation branch. Use focused commits, preserve user changes, and open a pull request with verification evidence before merging to main. Record actual run/build/test commands in README.md once available.
- Verify forms end to end, responsive layout, keyboard access, errors, and reduced motion as relevant. Add meaningful tests for behavior and bugs, not tests that merely mirror implementation.
- Keep secrets in environment configuration; commit only placeholder examples. Never commit prospect lists, client data, local credential files, or generated tool reports containing secrets.
- Establish the automated test suite and CI with the first application implementation; extend meaningful coverage as functionality grows. See WORKFLOW.md for the verification standard.
- Update affected instructions when behavior, architecture, or workflow changes. Remove obsolete rules rather than accumulating exceptions. Separate current implementation facts from proposed capabilities.
- Update TASKS.md when a deliverable is complete or a material decision changes.
