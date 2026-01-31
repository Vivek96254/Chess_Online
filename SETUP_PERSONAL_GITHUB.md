# Setup Personal GitHub for This Repository

This repository is configured to use your **personal GitHub account** without affecting your global (office) Git configuration.

## Steps to Complete Setup

### 1. Set Local Git Configuration (Personal Account)
Replace `YOUR_PERSONAL_USERNAME` and `YOUR_PERSONAL_EMAIL` with your actual personal GitHub credentials:

```bash
cd /home/vivekkumar/Desktop/Chess_Online

# Set local user name and email (only for this repo)
git config --local user.name "Vivek96254"
git config --local user.email "vivekvinay96254@gmail.com"
```

### 2. Verify Local Configuration
```bash
# Check that local config is set correctly
git config --local --list | grep user
```

### 3. Create Repository on GitHub
1. Go to https://github.com/new
2. Create a new repository (e.g., `Chess_Online`)
3. **DO NOT** initialize with README, .gitignore, or license (we already have these)

### 4. Add Remote and Push
Replace `YOUR_PERSONAL_USERNAME` and `REPO_NAME` with your actual values:

```bash
# Add remote (using HTTPS - recommended for personal accounts)
git remote add origin https://github.com/Vivek96254/Chess_Online.git

# Or if you prefer SSH (requires SSH key setup for personal account):
# git remote add origin git@github.com-personal:YOUR_PERSONAL_USERNAME/REPO_NAME.git

# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: Chess Online application"

# Push to GitHub
git push -u origin main
```

## Authentication Options

### Option A: HTTPS with Personal Access Token (Recommended)
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with `repo` permissions
3. Use the token as password when prompted

### Option B: SSH with Different Key
If you want to use SSH for personal account while keeping office SSH for work:

1. Generate a new SSH key for personal account:
```bash
ssh-keygen -t ed25519 -C "YOUR_PERSONAL_EMAIL" -f ~/.ssh/id_ed25519_personal
```

2. Add to SSH config (`~/.ssh/config`):
```
# Office GitHub
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_office

# Personal GitHub
Host github.com-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
```

3. Add public key to personal GitHub account
4. Use `github.com-personal` as host in remote URL

## Verify Setup

```bash
# Check that global config is unchanged (should show office account)
git config --global --list | grep user

# Check that local config shows personal account (only for this repo)
git config --local --list | grep user

# Verify remote is set correctly
git remote -v
```

## Important Notes

- ✅ Local config only affects this repository
- ✅ Global config (office account) remains unchanged
- ✅ Other repositories will continue using office account
- ✅ This repo will use personal account for all commits
