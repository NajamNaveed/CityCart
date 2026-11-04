/** "Cooking oil & ghee › Ghee" from the category tree, for showing where an item sits. */
export function categoryLabelFor(categories, categoryId) {
  for (const top of categories) {
    if (top._id === categoryId) return top.name
    const child = top.children.find((c) => c._id === categoryId)
    if (child) return `${top.name} › ${child.name}`
  }
  return ''
}
