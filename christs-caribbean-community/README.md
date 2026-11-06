# Christ's Caribbean Community

Standalone static site for ChristsCaribbeanCommunity.com (separate from the Stevensosmoore art site).

## Deploy on Vercel
1. Vercel → Add New → Project → import `gibsonsmoore1234/Stevensosmoore`.
2. **Root Directory**: `christs-caribbean-community`. Framework Preset: **Other**. Leave the build command empty.
3. Deploy, then Settings → Domains → add `christscaribbeancommunity.com`.

## Before launch, edit `config.js`
- `stripeMembershipLink`: a Stripe Payment Link for $100. Set its success URL to `https://christscaribbeancommunity.com/?paid=1`.
- `allChatLink` / `membersChatLink` / `memberCallLink`: group chat and call invite links.
- `confirmedMembers`: update as payments come in (drives the progress bar).

## Important limitation
Sign-ups are stored only in the visitor's browser. The members-only gating is cosmetic, not secure:
anyone can read the page source and get the members' links and plans. Before you take real money, add
a backend (e.g. Supabase auth + a Stripe webhook that marks members as paid) so members-only content
is served only to verified paying members, and so you have a real member list.
