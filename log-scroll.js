// Scroll only the table viewport; keep the video and the rest of the page still.
export function followLogRow(container,row) {
  const viewport=container.getBoundingClientRect(), bounds=row.getBoundingClientRect();
  const headerHeight=container.querySelector('thead').getBoundingClientRect().height;
  const top=viewport.top+container.clientTop+headerHeight;
  const bottom=viewport.top+container.clientTop+container.clientHeight;
  if(bounds.top>=top&&bounds.bottom<=bottom)return;
  const center=(top+bottom)/2;
  const target=container.scrollTop+(bounds.top+bounds.bottom)/2-center;
  container.scrollTo({top:Math.max(0,Math.min(container.scrollHeight-container.clientHeight,target)),behavior:'auto'});
}
