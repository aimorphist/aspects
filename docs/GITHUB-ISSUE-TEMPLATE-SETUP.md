# GitHub Issue Template Setup

Step-by-step instructions to enable the aspect submission issue template.

## Prerequisites

- GitHub repository with admin access
- The template file already exists at `.github/ISSUE_TEMPLATE/new-aspect.yml`

## Setup Steps

### 1. Verify the template file exists

```bash
ls -la .github/ISSUE_TEMPLATE/
# Should show: new-aspect.yml
```

### 2. Commit and push the template

```bash
git add .github/ISSUE_TEMPLATE/new-aspect.yml
git commit -m "Add aspect submission issue template"
git push origin main
```

### 3. Test the template

Open this URL in your browser:

```
https://github.com/aimorphist/aspects/issues/new?template=new-aspect.yml
```

You should see a form with:
- Aspect Name (slug)
- Display Name
- Publisher
- Tagline
- Category dropdown
- aspect.json content textarea
- GitHub Repository (optional)
- Additional Notes
- Terms checkboxes

### 4. Enable Issues (if disabled)

1. Go to your repo: `https://github.com/aimorphist/aspects`
2. Click **Settings** tab
3. Scroll to **Features** section
4. Check **Issues** checkbox

### 5. Configure labels (optional)

The template auto-applies these labels:
- `new-aspect`
- `needs-review`

Create them if they don't exist:

1. Go to **Issues** → **Labels**
2. Click **New label**
3. Create:
   - Name: `new-aspect`, Color: `#7057ff`
   - Name: `needs-review`, Color: `#fbca04`

## Template Location

```
.github/
└── ISSUE_TEMPLATE/
    └── new-aspect.yml
```

## Direct Submission URL

Share this URL for easy submissions:

```
https://github.com/aimorphist/aspects/issues/new?template=new-aspect.yml
```

## Troubleshooting

### Template not showing

1. Make sure the file is in `.github/ISSUE_TEMPLATE/` (not `.github/ISSUE_TEMPLATES/`)
2. File must end in `.yml` or `.yaml`
3. Push to the default branch (usually `main`)
4. Wait a few minutes for GitHub to index

### Form validation errors

The template uses GitHub's form schema. If you see errors:
1. Validate YAML syntax at https://yamlchecker.com
2. Check field types match GitHub's schema
3. Ensure all required fields have `validations.required: true`

## Customizing the Template

Edit `.github/ISSUE_TEMPLATE/new-aspect.yml`:

```yaml
name: 🧙 New Aspect Submission
description: Submit a new aspect to the Morphist registry
title: "[Aspect] "
labels: ["new-aspect", "needs-review"]
body:
  - type: input
    id: name
    attributes:
      label: Aspect Name
      placeholder: my-wizard
    validations:
      required: true
  # ... more fields
```

See [GitHub's documentation](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) for full schema.
