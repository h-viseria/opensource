import { getCategoryTree, createCategory, updateCategory, archiveCategory, categoryInUse, reorderCategories } from '../../services/categoryService.js';
import { escapeHtml } from '../../utils/html.js';
import { formModal, confirmModal } from '../modal.js';
import { showToast } from '../toast.js';

export async function renderCategories() {
  const outlet = document.getElementById('outlet');
  const tree = await getCategoryTree();
  outlet.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h2>Categories</h2>
        <button type="button" class="btn btn--primary" id="btn-add">Add</button>
      </div>
      <ul class="cat-tree">
        ${tree
          .map(
            (g) => `<li>
              <div class="cat-row" style="border-color:${escapeHtml(g.color)}">
                <strong>${escapeHtml(g.name)}</strong>
                <button type="button" class="btn btn--ghost btn--sm" data-add-child="${g.id}">Sub</button>
                <button type="button" class="btn btn--ghost btn--sm" data-arch="${g.id}">Archive</button>
              </div>
              <ul>${(g.children || [])
                .map(
                  (c) =>
                    `<li class="cat-row"><span>${escapeHtml(c.name)}</span>
                    <button type="button" class="btn btn--ghost btn--sm" data-arch="${c.id}">Archive</button></li>`
                )
                .join('')}</ul>
            </li>`
          )
          .join('')}
      </ul>
    </section>
  `;
  outlet.querySelector('#btn-add')?.addEventListener('click', () => addCat());
  outlet.querySelectorAll('[data-add-child]').forEach((b) =>
    b.addEventListener('click', () => addCat(b.getAttribute('data-add-child')))
  );
  outlet.querySelectorAll('[data-arch]').forEach((b) =>
    b.addEventListener('click', async () => {
      const id = b.getAttribute('data-arch');
      if (await categoryInUse(id)) {
        const ok = await confirmModal({
          title: 'Archive category?',
          bodyHtml: '<p>This category is used by transactions. It will be archived, not deleted.</p>',
        });
        if (!ok) return;
      }
      await archiveCategory(id);
      showToast('Archived', 'success');
      renderCategories();
    })
  );
  void reorderCategories;
  void updateCategory;
}

async function addCat(parentId) {
  const fd = await formModal({
    title: parentId ? 'Subcategory' : 'Category',
    fieldsHtml: `<div class="field"><label class="field__label" for="n">Name</label><input class="input" id="n" name="name" required /></div>
      <div class="field"><label class="field__label" for="color">Color</label><input class="input" id="color" name="color" type="color" value="#1F7A6A" /></div>`,
  });
  if (!fd) return;
  await createCategory({ name: String(fd.get('name')), parentId: parentId || null, color: String(fd.get('color')) });
  showToast('Saved', 'success');
  renderCategories();
}
