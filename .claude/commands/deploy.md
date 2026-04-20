Commit and push all changes to GitHub (which triggers a Vercel deployment).

Run this bash command:
```bash
git add -A && git diff --cached --quiet && echo "Nothing to commit." || (git commit -m "deploy: $ARGUMENTS" && git push && echo "Pushed successfully.")
```

If `$ARGUMENTS` is empty, use the commit message `"deploy: updates"`.
