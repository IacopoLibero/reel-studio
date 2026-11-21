---
name: reel-threads
description: Turn a reel into one to three short Meta Threads posts. Use when the person asks for a Threads post, a Threads text for a reel, "post this on Threads", or when the daily plan wants a Threads text per idea.
---
<!-- Adapted from the MIT-licensed Ootto skill x-thread-strategy (https://github.com/Ootto-AI/claude-content-skills), reshaped for Meta Threads. -->

# Reel threads

Make 1 to 3 short Threads posts from a finished reel or an idea. Audience: restaurant owners. This skill only writes text: it never posts.

## Rules
- Each post: plain text, **500 characters at most** (count them), one idea, readable alone.
- Post 1 is the hook: the reel's opening question or a sharper version. Posts 2-3 (optional) give one useful point each from the reel; never repeat the hook.
- Say only what the reel or its source supports. No invented numbers, results or quotes. Legal topics: add "General information, not legal advice."
- Voice of the brand (`<brand folder>/identity/style.md`): friendly, practical, no hype, no emoji spam (one at most), no hashtags or at most one.
- End with a link to the Instagram reel when its URL is given, otherwise no link. At most one soft call: reply, save, or follow.
- Same language as the reel.
- Posting happens only through Composio `THREADS_CREATE_POST`, after the user has connected Threads and confirms each post. Until then, only output the text.

## Output
```
THREADS 1 (<n> chars): <text>
THREADS 2 (<n> chars): <text>   (optional)
THREADS 3 (<n> chars): <text>   (optional)
Link: <instagram reel url or none>
```
