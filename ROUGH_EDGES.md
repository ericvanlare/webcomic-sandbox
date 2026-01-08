# AI Modification Flow - Rough Edges & Future Improvements

## Fixed ✅

- **Preview URL not ready immediately** - Now uses HEAD request to check if preview is actually live before showing "Ready to Review"
- **Closed PRs show weirdly** - Added "Discarded" status for rejected PRs

## Not Yet Addressed

### Quick Wins

1. **No polling/auto-refresh**
   - User has to manually click "Refresh" to see status updates
   - Fix: Poll every 15s when AI panel is open

2. **No way to cancel pending request**
   - If user submits a request and changes their mind before Copilot starts, there's no cancel button
   - Fix: Add cancel button that closes the issue

### Lower Priority

3. **"Waiting for Copilot" is a black box**
   - No indication if Copilot actually started working
   - Could check if the issue has any comments from Copilot to show "Copilot is working..." vs "Waiting..."
   - Marginal benefit, complex to implement

4. **No iteration history**
   - When you request changes, you don't see what you've already asked for
   - Workaround: Users can click "View Issue" to see GitHub comments
   - Nice-to-have: Show comment history inline

5. **Revert of revert confusion**
   - If user reverts, then regrets it, they'd have to revert the revert
   - We do show "Revert:" prefix in titles to help identify these
   - Edge case, users will figure it out

## Other Considerations for Production

- **Cloudflare Access** - Ensure /admin is protected
- **Error states** - What if Copilot never picks up an issue? Add timeout hint?
- **Onboarding** - Brief explainer in UI for the "request → preview → approve" flow
- **Rate limits** - GitHub API limits if many requests (fine for low volume)
