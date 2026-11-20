const cream = '#f3f0e7';
const red = '#f38b86';
const purple = '#d4b9f2';
const muted = '#b5bcc3';
const gradeColors = {
  A: '#9ee3ae', B: '#9bd9f3', C: '#f1d27c', D: '#f4a76d', F: '#fa858b',
};

function drawCard(canvas, {username, date, distance, rank, grades}, logo) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const glow = ctx.createRadialGradient(860, 155, 20, 780, 280, 1020);
  glow.addColorStop(0, '#523641');
  glow.addColorStop(.58, '#25252e');
  glow.addColorStop(1, '#17191c');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  ctx.lineWidth = 1.5;
  for (let ring = 0; ring < 31; ring++) {
    const radius = 55 + ring * 24;
    ctx.beginPath();
    for (let step = 0; step <= 160; step++) {
      const angle = step * Math.PI / 80;
      const shape = radius * (1 + .16 * Math.sin(angle * 3 + ring * .13) + .09 * Math.cos(angle * 5));
      const x = 840 + shape * Math.cos(angle);
      const y = 275 + shape * Math.sin(angle) * .8;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = ring % 5 === 0 ? '#d5adb035' : '#cdb5c326';
    ctx.stroke();
  }

  const text = (value, x, y, font, color, maxWidth) => {
    ctx.font = font;
    ctx.fillStyle = color;
    if (maxWidth === undefined) ctx.fillText(value, x, y);
    else ctx.fillText(value, x, y, maxWidth);
  };

  ctx.strokeStyle = '#5d535e';
  ctx.strokeRect(32, 32, 1016, 1016);
  ctx.fillStyle = red;
  ctx.fillRect(32, 32, 1016, 5);
  let brandX = 76;
  if (logo.complete && logo.naturalWidth) {
    ctx.drawImage(logo, 76, 63, 70, 70);
    brandX = 162;
  }
  text('TORNADO GUESSER', brandX, 107, 'bold 28px Arial', cream);
  text('DAILY CHALLENGE', 76, 225, '800 82px Arial', cream);
  text(date, 78, 278, '32px Arial', purple);
  ctx.fillStyle = '#5d535e';
  ctx.fillRect(76, 323, 928, 2);

  ctx.fillStyle = '#181b21ed';
  ctx.fillRect(76, 356, 928, 300);
  ctx.fillStyle = purple;
  ctx.fillRect(76, 356, 4, 300);
  text('PLAYER', 104, 408, 'bold 23px Arial', muted);
  text(username, 104, 476, 'bold 58px Arial', cream, 872);
  text('AVERAGE DISTANCE', 104, 542, 'bold 22px Arial', muted);
  text(distance, 104, 612, 'bold 62px Arial', cream, 520);
  text('PLAYER RANK', 743, 542, 'bold 22px Arial', muted);
  text(rank, 743, 612, 'bold 58px Arial', purple, 230);

  if (!grades) {
    ctx.fillStyle = '#181b21ed';
    ctx.fillRect(76, 696, 928, 160);
    text('ROUND GRADES', 104, 751, 'bold 22px Arial', muted);
    text('Unavailable for this score', 104, 814, 'bold 38px Arial', cream);
  }
  grades?.forEach((grade, index) => {
    const x = 76 + index * 189;
    const width = 172;
    const color = gradeColors[grade];
    ctx.fillStyle = '#181b21ed';
    ctx.fillRect(x, 696, width, 160);
    ctx.strokeStyle = '#5d535e';
    ctx.strokeRect(x, 696, width, 160);
    ctx.fillStyle = color;
    ctx.fillRect(x, 696, width, 4);
    ctx.textAlign = 'center';
    text('ROUND ' + (index + 1), x + width / 2, 744, 'bold 20px Arial', muted);
    text(grade, x + width / 2, 822, 'bold 68px Arial', color);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = '#5d535e';
  ctx.fillRect(76, 926, 928, 2);
  text('tornadoguesser.app', 76, 982, 'bold 31px Arial', cream);
}

export function setupDailyShare(getResult) {
  const el = id => document.getElementById(id);
  const dialog = el('daily-share-dialog');
  const canvas = el('daily-share-card');
  const download = el('daily-share-download');
  const nativeShare = el('daily-share-native');
  const textBox = el('daily-share-text');
  const status = el('daily-share-status');
  let url;
  let image;
  let generation = 0;

  function openDailyShare(result = getResult()) {
    if (!result || dialog.open) return;
    const {username, day, date, distance, rank, grades} = result;
    const text = [
      'Tornado Guesser Daily · ' + date,
      username + ' · ' + rank,
      (grades ? grades.join(' · ') + ' · ' : '') + 'Average distance ' + distance,
      'https://tornadoguesser.app/',
    ].join('\n');
    textBox.value = text;
    textBox.hidden = download.hidden = nativeShare.hidden = true;
    status.textContent = '';
    drawCard(canvas, result, document.querySelector('.brand-mark'));
    canvas.setAttribute('aria-label', text);
    dialog.showModal();
    const preview = ++generation;
    canvas.toBlob(blob => {
      if (!blob || !dialog.open || preview !== generation) return;
      url = URL.createObjectURL(blob);
      image = new File([blob], 'tornado-guesser-daily-' + day + '.png', {type: 'image/png'});
      download.href = url;
      download.download = image.name;
      download.hidden = false;
      nativeShare.hidden = !navigator.canShare?.({files: [image]});
    }, 'image/png');
  }

  el('daily-share-open').addEventListener('click', () => openDailyShare());
  el('daily-share-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textBox.value);
      status.textContent = 'Result copied.';
    } catch {
      textBox.hidden = false;
      textBox.focus();
      textBox.select();
      status.textContent = 'Select and copy the result text.';
    }
  });

  nativeShare.addEventListener('click', async () => {
    if (!image) return;
    try {
      await navigator.share({files: [image], text: textBox.value});
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = 'Use Download PNG to save the image.';
    }
  });

  dialog.addEventListener('close', () => {
    generation++;
    if (url) URL.revokeObjectURL(url);
    url = image = null;
  });
  return openDailyShare;
}
