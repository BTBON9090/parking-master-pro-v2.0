"""Run after afconvert mono decode. Source URLs and cuts are in docs/round44/audio.md."""
import wave,struct,math
from pathlib import Path
for name,source,start,end in [('farm-idle','0499',7,10),('farm-load','0499',11,14),('heavy-idle','1443',4,8),('heavy-load','1443',38,42),('diesel-idle','1147',1,3),('diesel-load','1147',9,12)]:
 with wave.open('/tmp/car44-audio/'+source+'.wav','rb') as w:
  rate=w.getframerate();w.setpos(int(start*rate));data=list(struct.unpack('<'+'h'*int((end-start)*rate),w.readframes(int((end-start)*rate))))
 mean=sum(data)/len(data);data=[v-mean for v in data];fade=int(rate*.08)
 # Overlap-add closes the loop, then a 1ms edge window removes residual click.
 for i in range(fade):
  t=i/fade;data[i]=data[-fade+i]*(1-t)+data[i]*t
 data=data[:-fade];peak=max(map(abs,data));data=[v/max(1,peak)*21000 for v in data]
 for i in range(48):data[i]*=i/48;data[-1-i]*=i/48
 with wave.open('public/audio/'+name+'-loop.wav','wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(struct.pack('<'+'h'*len(data),*[int(v) for v in data]))
