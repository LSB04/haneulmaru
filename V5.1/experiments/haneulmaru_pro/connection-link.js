export function parseConnectionLink(text){
 let value=String(text).trim().replace(/^"(.*)"$/,'$1');
 if(!value.includes('://'))value='https://'+value;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.search||!['/phone','/phone/'].includes(u.pathname)||!/^#[A-Za-z0-9_-]{20,128}$/.test(u.hash))throw Error();
  u.pathname='/phone';return u.href;
 }catch{throw Error('PC의 QR 전체 주소를 넣으세요. /phone# 뒤 연결키까지 필요합니다.');}
}
