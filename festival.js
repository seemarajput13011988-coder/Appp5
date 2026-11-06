const toggle = document.getElementById('kbFestivalToggle');
const layer = document.getElementById('kbFestivalLayer');
if (toggle && layer) {
  let active = false;
  toggle.addEventListener('click', () => {
    active = !active;
    toggle.setAttribute('aria-pressed', String(active));
    toggle.textContent = active ? '✦ Stop celebration' : '🪔 Celebrate';
    layer.classList.toggle('active', active);
    layer.replaceChildren();
    if (!active || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const banner = document.createElement('div');
    banner.className = 'kb-festival-banner';
    banner.textContent = '✨ K&B NET SERVICE · Celebrate Together ✨';
    layer.append(banner);
    const symbols = ['✦', '✧', '🪔', '❋', '✨'];
    for (let i = 0; i < 28; i++) {
      const spark = document.createElement('span');
      spark.className = 'kb-festival-spark';
      spark.textContent = symbols[i % symbols.length];
      spark.style.left = (Math.random() * 100) + '%';
      spark.style.setProperty('--dur', (2 + Math.random() * 3) + 's');
      spark.style.setProperty('--drift', ((Math.random() - .5) * 140) + 'px');
      spark.style.animationDelay = (Math.random() * 1.5) + 's';
      layer.append(spark);
    }
  });
}