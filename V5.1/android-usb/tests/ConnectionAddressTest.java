package io.haneulmaru.v5usb;
public class ConnectionAddressTest {
 public static void main(String[] args){
  String base="demo.trycloudflare.com/phone",key="abcdefghijklmnopqrstuvwx";
  for(String s:new String[]{"https://"+base+"#"+key,base+"#"+key,"  https://demo.trycloudflare.com/phone/#"+key+"  ","\"https://"+base+"#"+key+"\""}){
   if(!("https://"+base+"#"+key).equals(ConnectionAddress.parse(s).toString()))throw new AssertionError();
  }
  for(String s:new String[]{"http://"+base+"#"+key,"https://"+base,"https://"+base+"#short","https://user@"+base+"#"+key,"javascript:alert(1)","https://demo.trycloudflare.com/admin#"+key,"https://"+base+"?next=x#"+key}){
   try{ConnectionAddress.parse(s);throw new AssertionError("Invalid link accepted");}catch(IllegalArgumentException expected){}
  }
  System.out.println("V5.1 QR address validation passed");
 }
}
