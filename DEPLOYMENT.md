```
git tag -a v1.3.0 -m "Release version 1.3.0"
```

Delete and Recreate the Tag

```
git tag -d v1.3.0
git push origin --delete v1.3.0

git tag -a v1.3.0 -m "Release version 1.3.0"
git push origin v1.3.0
```
