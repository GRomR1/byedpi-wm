//1_fix_button_select_input.js
document.addEventListener('click', function(e) {
  if (e.target.matches('button')) {
    e.target.blur();
  }
});

document.addEventListener('change', function(e) {
  if (e.target.matches('select')) {
    e.target.blur();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.target.matches('input') && e.key === 'Enter') {
    e.target.blur();
  }
});