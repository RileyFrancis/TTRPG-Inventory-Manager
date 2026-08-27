# Contributing

Thanks for taking a look and having interest in the project! This is a small project with a few conventions that keep things running smoothly.

## Getting set up

Serve the project root over HTTP and open it; there is nothing to install and
nothing to build. See [Running](README.md#running) in the README, and
[Party play and accounts](README.md#party-play-and-accounts) if you need Firebase.

**Read the docs before changing anything structural.**
[ARCHITECTURE.md](ARCHITECTURE.md) is the map — where things live, what loads in
what order, and what the data looks like. [CLAUDE.md](CLAUDE.md) is why things
are the way they are, and which of them are load-bearing. If your change
invalidates something either one says, update it in the same commit.

## Commits

Please keep commits conscise and simple. They should change/add/remove one thing each. Please use the following format for your commit message:

```
(x.y.z): Add a thing that does the other thing
```

... where x is a major feature, y is a minor one, and z is a patch.

**IMPORTANT:** You must bump the one-line [`VERSION`](ARCHITECTURE.md#versioning) file to match your commit version.

## Issues and pull requests

Bug reports are extremely useful! To help squash spotted bugs, please include the steps to reproduce the bug and what you expected
instead. For feature requests, you may open an issue with your requested feature, or implement it yourself. If you choose to implement it yourself, please follow format for commit messages above. When your feature is complete and has been tested, please open a pull request into main.

---

By contributing, you agree that your contributions are licensed under
[CC BY-NC-SA 4.0](LICENSE), the same terms as the project.
