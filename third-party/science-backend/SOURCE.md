# DSH Science Backend

This development binary is a modified build of CSSwitch, copyright (c) 2026 shanjunjie, under MIT license. See `../CSSwitch-LICENSE`. The corresponding source for this draft is included at `backend-source/` in the repository.

The modifications provide a private stdin/stdout control interface, use `.dsh-science-backend` for separate state, suppress the extra browser window, and remove the launcher commands that alter the user's default keychain and keychain search list. The result is ad-hoc signed locally, not signed with an Apple Developer certificate.

The backend and the removal of keychain preference changes have been verified with a real Science runtime on the development Mac. A clean-account installation remains unverified. This is a review prototype; third-party dependency and frontend license notices require further review before redistribution.
