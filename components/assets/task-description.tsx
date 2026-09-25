export function TaskDescription({text}:{text:string}){
 return <span className="whitespace-pre-wrap">{text.split(/(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-?[\d.]+,-?[\d.]+|^Phone: \+?[\d ().-]{6,40}$)/gm).map((part,i)=>{
  if(part.startsWith('https://www.google.com/maps/search/?api=1&query='))return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline">Open asset location ↗</a>;
  if(/^Phone: \+?[\d ().-]{6,40}$/.test(part)){const phone=part.slice(7);return <span key={i}>Phone: <a className="underline" href={`tel:${phone.replace(/[^+\d]/g,'')}`}>{phone}</a></span>;}
  return part;
 })}</span>;
}
