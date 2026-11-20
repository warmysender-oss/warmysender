# Cutting a release

Releases are git tags `vMAJOR.MINOR.PATCH` (for example `v0.1.0`). Pushing the tag runs two workflows:

| Workflow | What it does |
| --- | --- |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Publishes a GitHub Release whose notes are the matching section of `CHANGELOG.md` |
| [`.github/workflows/docker-image.yml`](../.github/workflows/docker-image.yml) | Builds `linux/amd64` and `linux/arm64` and pushes `ghcr.io/warmysender-oss/warmysender` |

Image tags for `v1.2.3`:

| Tag | When |
| --- | --- |
| `1.2.3` | every `v1.2.3` tag, including a prerelease such as `v1.2.3-rc.1` |
| `1.2` and `1` | the semver major and minor |
| `latest` | the tag name contains no hyphen |

`CHANGELOG.md` is maintained with the foundation of the repo (Keep a Changelog headings). The release workflow copies one section. The heading for tag `v1.2.3` is any one of:

```markdown
## [1.2.3] - YYYY-MM-DD
## [v1.2.3] - YYYY-MM-DD
## 1.2.3 - YYYY-MM-DD
## v1.2.3 - YYYY-MM-DD
```

The section runs until the next `## ` heading. A missing file, a missing heading, or an empty section fails the workflow, so a tag cannot publish blank notes.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Push the tag. Leave `main` for pull requests.
