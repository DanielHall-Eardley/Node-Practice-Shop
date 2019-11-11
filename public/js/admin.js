const deleteProduct = (btn) => {
  const id = btn.parentNode.querySelector("[name=productId]").value
  const csrf = btn.parentNode.querySelector("[name=_csrf]").value
  const parentElement = btn.closest("article")

  fetch("/admin/delete-product/" + id, {
    method: "delete",
    headers: {
      "csrf-token": csrf
    }
  })
  .then(res => {
    console.log(res)
    parentElement.remove()
  })
  .catch(err => {
    console.log(err)
  })
}
