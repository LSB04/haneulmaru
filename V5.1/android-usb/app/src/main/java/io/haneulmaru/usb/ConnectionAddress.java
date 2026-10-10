package io.haneulmaru.v5usb;
import java.net.URI;

/** Accept the full QR link, also when the copied text omits the HTTPS scheme. */
public final class ConnectionAddress {
 public static URI parse(String text){
  try{
   String value=text.trim();
   if(value.startsWith("\"")&&value.endsWith("\""))value=value.substring(1,value.length()-1);
   if(!value.contains("://"))value="https://"+value;
   URI u=new URI(value);String key=u.getRawFragment();
   if(!"https".equalsIgnoreCase(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getRawQuery()!=null||
      !("/phone".equals(u.getRawPath())||"/phone/".equals(u.getRawPath()))||key==null||!key.matches("[A-Za-z0-9_-]{20,128}")||u.getPort()==0||u.getPort()>65535)throw new IllegalArgumentException();
   return new URI("https://"+u.getRawAuthority()+"/phone#"+key);
  }catch(Exception e){throw new IllegalArgumentException("PC의 연결 주소 복사 버튼으로 /phone#연결키까지 복사하세요.");}
 }
}
