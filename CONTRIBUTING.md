# Contributing

Thanks for your interest in Open Cold Email! The project is in early development, so the codebase and these guidelines will change quickly.

## Ground rules

- Be kind. Everyone taking part must follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Never report security problems in public issues — see [SECURITY.md](SECURITY.md).
- This project exists to send **legitimate, permission-respecting outreach**. Contributions that help evade spam filters, scrape personal data unlawfully, or ignore unsubscribes and bounce handling won't be accepted.

## How to contribute

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you write code.
2. **Fork** the repository and create a branch from `main` (`fix/short-description` or `feat/short-description`).
3. **Make your change.** Keep pull requests focused on one thing. Add or update tests where it makes sense.
4. **Check your work** — run the linter and tests (commands will be documented here once the app lands).
5. **Open a pull request** and fill in the template. Link the issue it closes.

## Commit messages

Use short, imperative subject lines, e.g. `Add SMTP connection test`. [Conventional Commits](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `docs:`) are welcome.

## Secrets

Never commit API keys, passwords, mailbox credentials or `.env` files. Use `.env.example` for placeholder values only.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE), the same license as the project.
