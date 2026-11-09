# discord-webhook

A Cloudflare Worker that verifies GitHub webhook signatures, filters push events
by branch, and forwards the original payload to Discord's GitHub-compatible
endpoint. Discord supplies the notification formatting.

The default source is `ATTWoWAddon/AllTheThings`, with pushes to `master` allowed.
This repository's deployment branch, `main`, is independent of that source branch.

## 1. Deploy the Worker

You need Node.js with npm, a Cloudflare account, and access to the destination
Discord channel and source GitHub repository's webhook settings.

From the repository root, run:

```sh
npx wrangler login
npx wrangler deploy
```

Set `name` in `wrangler.jsonc` to `discord-webhook` to match the Cloudflare
deployment target. Use the Worker's HTTPS URL from the Wrangler deployment
output or the Cloudflare dashboard as the GitHub webhook destination. No build
step or project dependencies are required.

## 2. Configure Discord and secrets

In Discord, open **Server Settings > Integrations > Webhooks**, create or select
a webhook for the destination channel, and copy its URL.

Configure these two **runtime secrets** on the Cloudflare Worker:

| Secret | Value |
| --- | --- |
| `GITHUB_WEBHOOK_SECRET` | A secret shared with the source GitHub webhook. |
| `DISCORD_WEBHOOK_URL` | The copied Discord webhook URL, without `/github`. |

For a new setup, enter the values at the Wrangler prompts:

```sh
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put DISCORD_WEBHOOK_URL
```

Each `secret put` command deploys the updated secret immediately. If the existing
Worker already has the correct secrets, keep them; normal deployments preserve
them. Build variables do not replace runtime secrets. Keep secret values out of
the repository.

The Worker adds `/github` to the URL path. Query parameters are preserved; to
target an existing Discord thread, use a base URL such as:

```text
https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN?thread_id=THREAD_ID
```

Replace the placeholders with your own values. Do not add `/github` yourself.

## 3. Configure the source GitHub webhook

### Find the Payload URL

The **Payload URL** is the public HTTPS endpoint that GitHub sends webhook POST
requests to. For this project, it is the deployed Cloudflare Worker's URL.

To find it in the Cloudflare dashboard:

1. Open **Workers & Pages** and select the `discord-webhook` Worker.
2. Open **Settings > Domains & Routes**.
3. Copy the enabled `workers.dev` URL, or use a public URL configured for this Worker.

For `workers.dev`, the address has this form:

```text
https://discord-webhook.<account-subdomain>.workers.dev/
```

`discord-webhook` comes from `name` in `wrangler.jsonc`. Replace
`<account-subdomain>` with the actual Cloudflare account subdomain shown in the
dashboard; it is independent of the GitHub organization name. For example, if
the subdomain were `example-account`, the Payload URL would be:

```text
https://discord-webhook.example-account.workers.dev/
```

That is an example, not your account's actual address. Copy your deployed URL
from the dashboard or a previous successful `npx wrangler deploy` output. If
`workers.dev` is disabled, use the Worker's configured Custom Domain or an actual
HTTPS URL matching its Route; a wildcard route pattern is not a complete URL.
Use the production endpoint rather than a version preview URL.

See [Cloudflare's public Worker URL settings](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

| Address | Purpose |
| --- | --- |
| The public Worker HTTPS URL | GitHub webhook's **Payload URL**. |
| The Discord webhook URL | The Worker's `DISCORD_WEBHOOK_URL` runtime secret. |
| The GitHub repository URL | The source repository whose webhook settings you configure. |

Use the Worker's URL as shown. No `/github` suffix is needed here; the Worker
adds that suffix only to the Discord URL when forwarding a notification.

### Create the webhook

In `ATTWoWAddon/AllTheThings`, open **Settings > Webhooks > Add webhook**:

| Setting | Value |
| --- | --- |
| Payload URL | The public Worker URL described above. |
| Content type | `application/json`. |
| Secret | The same value as `GITHUB_WEBHOOK_SECRET`. |
| Events | **Just the push event**. |
| Active | Enabled. |

Save the webhook after both Worker secrets are configured. GitHub sends a `ping`
event, which should receive HTTP 200 with `OK`. This verifies the GitHub-to-Worker
connection; test a matching push separately to verify Discord delivery.

Opening the Payload URL in a browser sends a GET request, so this Worker returns
`405 Method Not Allowed`. Check the webhook's **Recent Deliveries** page in GitHub
to inspect the actual POST request and its response.

### Example: a second source repository

To add `NORPG/AllTheThings` as a second source, create a webhook there using the
same settings above. Use the same Worker URL and `GITHUB_WEBHOOK_SECRET`;
accepted pushes go to the same Discord webhook. Its source branch must be in
`ALLOWED_BRANCHES` (currently `master`).

## 4. Use and verify

Push to `master` in the source repository, or redeliver an existing matching push
from the webhook's **Recent Deliveries** page. A successful delivery returns
HTTP 200 with `Forwarded`, and a GitHub notification appears in Discord.

Pushes to other branches return `Ignored branch: <branch>` without a Discord
notification. Tags and events other than `push` are also ignored. Edit
`ALLOWED_BRANCHES` in `worker.js` and redeploy to change the allowed branches.

| Response | Check |
| --- | --- |
| `405 Method Not Allowed` | Send an HTTP POST request. |
| `500 Missing secrets` | Configure both runtime secrets on the Worker. |
| `403 Invalid signature` or `403 Forbidden` | Check that both GitHub secret values match. |
| `400 Invalid JSON` | Set the GitHub webhook content type to `application/json`. |
| `502 Discord error: <status>` | Check the Discord webhook URL, thread ID, and Discord's reported status. |

GitHub does not automatically retry failed webhook deliveries. After fixing a
failure, use **Recent Deliveries > Redeliver** to try it again.

## Automatic deployments from GitHub

To deploy this repository through Cloudflare Workers Builds, connect it to the
`discord-webhook` Worker with these settings:

| Setting | Value |
| --- | --- |
| Repository | `ATTWoWAddon/discord-webhook`. |
| Deployment branch | `main`. |
| Root directory | Repository root. |
| Build command | Empty. |
| Deploy command | `npx wrangler deploy`. |

Keep the configured Worker name and runtime secrets when connecting the repository.

## References

- [Cloudflare deployment settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).
- [Wrangler deployment and secret commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
- [GitHub webhook setup](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks).
- [GitHub webhook redelivery](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks).
- [Discord webhook setup](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).
