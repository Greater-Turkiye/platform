/* Greater Türkiye — shared helpers: i18n, data loading, geography.
   Plain browser JS, no build step. Data comes from the `datasets` Pages export. */
(function () {
  'use strict';

  const GT = (window.GT = {});
  GT.DATA_BASE = window.GT_DATA_BASE || '../datasets/';
  GT.REPO = 'https://github.com/Greater-Turkiye';

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  GT.lang = store.get('gt-lang') === 'en' ? 'en' : 'tr';

  /* ---------------- strings ---------------- */
  const I18N = {
    tr: {
      'a11y.skip': 'İçeriğe geç', 'a11y.menu': 'Menü', 'a11y.lang': 'Dil',
      'nav.panel': 'Panel', 'nav.data': 'Veri', 'nav.handbook': 'El Kitabı', 'nav.join': 'Katıl', 'nav.open': 'Paneli aç', 'nav.home': 'Ana sayfa',
      'hero.eyebrow': 'Açık kaynak istihbarat topluluğu',
      'hero.title1': 'Çevremizi', 'hero.title2': 'izliyoruz',
      'hero.lead': 'Türkiye’nin dış güvenlik ortamını yalnızca açık kaynaklardan izliyoruz. Her iddiayı kaynağına dayandırıyor, arşivliyor, insan incelemesinden geçiriyor ve herkesin denetleyebileceği açık veri olarak yayımlıyoruz.',
      'hero.cta1': 'Paneli aç', 'hero.cta2': 'Katkı ver',
      'hero.mapAria': 'Türkiye ve çevresi: izleme bölgeleri haritası',
      'hud.focus': 'Odak', 'hud.proj': 'Projeksiyon', 'hud.utc': 'UTC', 'hud.regions': 'İzleme bölgesi', 'hud.records': 'Kayıt', 'hud.hover': 'Bölge',
      'ticker.label': 'Kayıt akışı', 'ticker.empty': 'Kayıt akışı açılıyor — ilk kayıtları birlikte ekliyoruz', 'ticker.err': 'Veri akışına şu an ulaşılamıyor',
      'regions.eyebrow': 'İzleme alanları', 'regions.title1': 'Dışarıya bakan', 'regions.title2': 'göz.',
      'regions.lead': 'On dört editoryal izleme bölgesi. Bölgeler ilgi alanıdır; hiçbiri egemenlik iddiası değildir. Tartışmalı her nitelendirme sahibine atfedilir.',
      'regions.records': 'kayıt', 'regions.open': 'Panelde aç',
      'how.eyebrow': 'Yöntem', 'how.title1': 'Topla. Doğrula.', 'how.title2': 'İncele. Yayımla.',
      'how.lead': 'Hızdan önce doğruluk. Otomasyon toplar ve sıralar; karar her zaman insanındır.',
      'how.1.t': 'Topla', 'how.1.d': 'Resmî açıklamalar, haber ajansları, NAVTEX/NOTAM duyuruları, uydu ve takip servisleri: yalnızca kamuya açık kaynaklar.',
      'how.2.t': 'Doğrula', 'how.2.d': 'Admiralty ölçeği: kaynak güvenilirliği A–F, bilgi doğruluğu 1–6. Arşivlenmemiş kaynak doğrulanmış sayılmaz.',
      'how.3.t': 'İncele', 'how.3.d': 'Her kayıt insan incelemesinden geçer. “İhlal”, “provokasyon” gibi nitelendirmeler proje sesiyle değil, sahibine atfedilerek yazılır.',
      'how.4.t': 'Yayımla', 'how.4.d': 'Açık lisanslı veri: JSONL, CSV, GeoJSON. Hiçbir paylaşım insan onayı olmadan çıkmaz; düzeltmeler açıkça duyurulur.',
      'stats.eyebrow': 'Açık veri', 'stats.title1': 'Her kayıt', 'stats.title2': 'denetlenebilir.',
      'stats.lead': 'Kayıtlar Git’te tutulur, her değişiklik izlenebilir; veri CC BY 4.0 ile herkese açıktır.',
      'stats.event': 'Olay', 'stats.source': 'Kaynak', 'stats.actor': 'Aktör', 'stats.site': 'Tesis', 'stats.equipment': 'Teçhizat tipi',
      'stats.note': 'Canlı sayım · datasets deposundan', 'stats.err': 'Veri şu an yüklenemedi',
      'red.eyebrow': 'Kırmızı çizgiler', 'red.title1': 'Asla', 'red.title2': 'yapmadıklarımız.',
      'red.lead': 'Bu kurallar mutlaktır ve otomatik kontrollerle de uygulanır. Şüphedeysek yayımlamayız.',
      'red.1': 'Türk kuvvetlerinin konum ve hareketlerini paylaşmayız.',
      'red.2': 'Gizli ya da sızdırılmış materyal kullanmayız — hangi ülkeden olursa olsun.',
      'red.3': 'Askerî bölgelerde sahada bilgi toplamayız.',
      'red.4': 'Özel kişileri izlemez, kişisel veri yayımlamayız.',
      'red.5': 'Esir veya kayıp görüntüsü paylaşmayız.',
      'red.6': 'Hedef gösteren, kışkırtıcı ya da nefret içeren dil kullanmayız.',
      'red.7': 'Kaynaksız iddia sunmaz, telifli içeriği kopyalamayız.',
      'red.more': 'Kırmızı çizgilerin tamamı',
      'join.eyebrow': 'Katıl', 'join.title1': 'Takma adla da', 'join.title2': 'katkı verebilirsin.',
      'join.lead': 'Veri girişi, kaynak önerisi, çeviri, kod ya da inceleme. Önce kırmızı çizgiler ve OPSEC sayfalarını oku, sonra bir iş seç.',
      'join.datasets.k': 'Veri', 'join.datasets.t': 'datasets', 'join.datasets.d': 'Olay, aktör, tesis ve kaynak kayıtları; şemalar ve doğrulayıcı.',
      'join.handbook.k': 'Yöntem', 'join.handbook.t': 'handbook', 'join.handbook.d': 'Kırmızı çizgiler, doğrulama, OPSEC, stil rehberi ve karar kayıtları.',
      'join.platform.k': 'Kod', 'join.platform.t': 'platform', 'join.platform.d': 'Toplama, inceleme ve yayın altyapısı; bu site de burada.',
      'join.github.k': 'Topluluk', 'join.github.t': '.github', 'join.github.d': 'Davranış kuralları, yönetişim, güvenlik ve katkı rehberi.',
      'join.go': 'Depoyu aç', 'join.gfi': 'Yeni başlayanlara uygun işler', 'join.submit': 'Olay öner', 'join.member': 'Topluluğa üye ol',
      'foot.tag': 'Türkiye’nin dış güvenlik ortamı için açık kaynak istihbarat topluluğu.',
      'foot.disclaimer': 'Gönüllü topluluk; hiçbir devlet kurumu veya siyasi yapıyla bağlantılı değildir.',
      'foot.community': 'Topluluk', 'foot.data': 'Veri', 'foot.project': 'Proje',
      'foot.redlines': 'Kırmızı çizgiler', 'foot.coc': 'Davranış kuralları', 'foot.security': 'Güvenlik ve kaldırma', 'foot.opsec': 'OPSEC',
      'foot.dataset': 'Veri seti', 'foot.schemas': 'Şemalar', 'foot.releases': 'Sürümler', 'foot.cite': 'Atıf',
      'foot.roadmap': 'Yol haritası', 'foot.license': 'İçerik ve veri CC BY 4.0 · Kod MIT',
      /* method page / yöntem sayfası */
      'nav.method': 'Yöntem',
      'm.eyebrow': 'Yöntem', 'm.title1': 'Bu veriye ne kadar', 'm.title2': 'güvenmeli?',
      'm.lead': 'Bu sayfa bir kaydın nasıl oluştuğunu, hangi ölçekle değerlendirildiğini, neyi asla yayımlamadığımızı ve haritadaki her katmanın nereden geldiğini anlatır. Amacı sizi ikna etmek değil, kendi yargınıza varabilmeniz için yöntemi açık etmektir. Kurallar El Kitabı’nda tanımlıdır; bu sayfa onların özetidir ve her bölüm kaynağına bağlanır.',
      'm.jump': 'Bölümler', 'm.src': 'Kaynak',
      'm.s1.k': 'Kapsam', 'm.s1.t': 'Ne iddia ediyoruz, ne iddia etmiyoruz',
      'm.s1.lead': 'Gönüllü bir açık kaynak istihbarat topluluğuyuz. Tüzel kişiliğimiz yok; hiçbir devlet kurumu veya siyasi yapıyla bağlantılı değiliz. Yalnızca kamuya açık, pasif kaynaklarla çalışırız.',
      'm.s1.yes': 'Bu proje şudur',
      'm.s1.y1': 'Kamuya açık kaynaklardan derlenmiş, her biri bir kaynağa ve arşiv bağlantısına dayanan kayıtların açık bir derlemesi.',
      'm.s1.y2': 'Her kaydın güvenilirliğini açıkça söyleyen bir veri seti: kaynağın güvenilirliği ile bilginin inandırıcılığı ayrı ayrı yazılır.',
      'm.s1.y3': 'Git üzerinde tutulan, her değişikliği izlenebilen, herkesin denetleyebileceği açık veri.',
      'm.s1.y4': 'Türkiye’nin resmî tutumlarını, tutum olduğu açıkça etiketlenmiş ve kaynağına bağlanmış biçimde gösteren bir harita.',
      'm.s1.no': 'Bu proje şu değildir',
      'm.s1.n1': 'Haber sitesi değildir. Hız ikinci sıradadır; şüphedeysek yayımlamayız.',
      'm.s1.n2': 'Erken uyarı veya durum takip servisi değildir. Kayıtlar olmuş olayları belgeler; hiçbir bilgi gelecekteki bir eylem için sunulmaz.',
      'm.s1.n3': 'Resmî bir kaynak değildir ve hiçbir devletin sözcüsü değildir. “İhlal”, “provokasyon”, “işgal” gibi tartışmalı nitelendirmeler proje sesiyle yazılmaz; iddia olarak, sahibine atfedilerek kaydedilir.',
      'm.s1.n4': 'Kuvvet takip projesi değildir. Türk kuvvetlerinin konum ve hareketleri hiçbir koşulda yayımlanmaz.',
      'm.s1.note': '“Doğrulanmış”, olayın gerçekleştiği anlamına gelir; tarafların nitelendirmelerinin doğru olduğu anlamına gelmez. Bir uçağın belirli bir bölgede uçtuğu doğrulanabilir; bunun “ihlal” olup olmadığı taraflara atfedilir.',
      'm.s2.k': 'Akış', 'm.s2.t': 'Bir kayıt nasıl oluşur',
      'm.s2.lead': 'Otomasyon toplar ve sıralar; karar her zaman insanındır. Yayına giden yolda iki kapı vardır ve ikisini de insanlar tutar.',
      'm.s2.1.t': 'Öneri',
      'm.s2.1.d': 'Herkes, herkese açık formlarla olay veya kaynak önerebilir; toplayıcılar da aynı kuyruğa sinyal üretir. Kişisel veri, sızıntı veya Türk kuvvetlerine dair bilgi içerebilecek her şey herkese açık bir issue ile değil, özel kanaldan gönderilir: herkese açık bir gönderi, birleşmese bile görünür kalır.',
      'm.s2.2.t': 'Triyaj — Kapı 1',
      'm.s2.2.d': 'Ham sinyal, özel bir inceleyici grubunda elenir. Reddedilenler hiçbir yerde paylaşılmaz. Geçenler ya “DOĞRULANMADI” etiketli kısa bir bülten olur ya da kayda dönüşmek üzere işaretlenir. Bot kendi açtığı öneriyi kendisi birleştiremez.',
      'm.s2.3.t': 'Kaynak ve arşiv',
      'm.s2.3.d': 'Her bilgi bir kaynağa bağlanır; kaynak sicile girer ve bir güvenilirlik notu alır. Her kaynağın arşiv bağlantısı olmadan bir kayıt doğrulanmış sayılamaz. Birincil kaynaklar — Resmî Gazete, TBMM, bakanlıklar, BM — medyaya tercih edilir. Üçüncü taraf metni kopyalanmaz: kendi cümlelerimizle özetlenir, bağlantısı ve arşiv bağlantısı verilir.',
      'm.s2.4.t': 'Ölçek ve otomatik kapılar',
      'm.s2.4.d': 'Kayda kaynak güvenilirliği (A–F), bilgi inandırıcılığı (1–6) ve bir durum yazılır. Otomatik denetimler her değişiklikte kişisel veri kalıplarını, gizlilik derecesi işaretlerini, Türk kuvvetleri kapısını, kısıtlı kaynak kuralını ve biçim kurallarını uygular. Bu denetimler anlamı değerlendiremez: kaynakların gerçekten bağımsız olup olmadığına insan karar verir.',
      'm.s2.5.t': 'İnsan onayı — Kapı 2',
      'm.s2.5.d': 'Kayıt, herkese açık bir inceleme geçmeden veri setine giremez; hassas konular ayrıca bir bakımcı onayı ister. Hiçbir içerik insan onayı olmadan yayımlanmaz. Bakımcılar tüm otomatik yayını tek bir ayarla durdurabilir. Bir kayda düzeltme girildiğinde veya kayıt geri çekildiğinde, ilk paylaşımın yapıldığı kanallara düzeltme notu gönderilir.',
      'm.s2.note': 'Bülten ile kayıt aynı şey değildir: bülten kısa, atfedilmiş ve her zaman “doğrulanmadı” etiketli bir duyurudur, veri setinin parçası değildir. Her bülten ya bir kayda dönüşür ya da geri çekme notuyla kapanır.',
      'm.s3.k': 'Doğrulama', 'm.s3.t': 'Doğrulama ölçeği',
      'm.s3.lead': 'Doğrulama iki ayrı soruya cevap verir ve ikisi birbirinden bağımsızdır: güvenilir bir kaynak yanlış bilgi aktarabilir, güvenilmez bir kaynak doğru bilgi verebilir. Kullandığımız ölçek, OSINT ve analiz topluluğunun bildiği Admiralty (NATO) ölçeğidir.',
      'm.s3.q1': 'Kaynak ne kadar güvenilir? A–F',
      'm.s3.q1d': 'Kaynak sicilinde tutulur. Yeni kaynaklar F ile başlar; not yalnızca gerekçesi yazılmış bir incelemeyle değişir. Resmî kaynaklar otomatik olarak A değildir: bir bakanlık kendi kayıpları veya tartışmalı bir olay hakkında konuşurken taraftır.',
      'm.s3.a': 'Tamamen güvenilir — özgünlüğü, güvenilirliği ve yetkinliği konusunda şüphe yok. Pratikte çok nadir verilir.',
      'm.s3.b': 'Genellikle güvenilir — küçük şüpheler var; geçmişte büyük çoğunlukla doğru bilgi vermiş.',
      'm.s3.c': 'Oldukça güvenilir — şüpheler var; geçmişte zaman zaman doğru bilgi vermiş.',
      'm.s3.d': 'Genellikle güvenilir değil — ciddi şüpheler var.',
      'm.s3.e': 'Güvenilmez — özgünlük ve yetkinlikten yoksun; geçmişte yanlış bilgi vermiş.',
      'm.s3.f': 'Güvenilirliği değerlendirilemez — değerlendirme için temel yok. Yeni kaynaklar için varsayılan.',
      'm.s3.q2': 'Bu bilgi ne kadar inandırıcı? 1–6',
      'm.s3.q2d': 'Kaydın kendisinde tutulur. Yeni kayıtlar 6 ile başlar.',
      'm.s3.c1': 'Başka kaynaklarca doğrulanmış — bağımsız kaynaklar veya görsel/uzaysal kanıtla doğrulanmış; mantıklı ve tutarlı.',
      'm.s3.c2': 'Muhtemelen doğru — doğrulanmamış ama mantıklı, tutarlı ve bilinen tabloya uygun.',
      'm.s3.c3': 'Belki doğru — doğrulanmamış; makul ama bazı yönleriyle tutarsız veya eksik.',
      'm.s3.c4': 'Şüpheli — mümkün ama mantıklı değil; karşı bilgi var.',
      'm.s3.c5': 'Olası değil — mantıksız, başka bilgilerle çelişiyor.',
      'm.s3.c6': 'Doğruluğu değerlendirilemez — değerlendirme için temel yok. Yeni kayıtlar için varsayılan.',
      'm.s3.st': 'Durum ne anlama geliyor?',
      'm.st.u': 'Doğrulanmamış', 'm.st.p': 'Kısmen doğrulanmış', 'm.st.v': 'Doğrulanmış', 'm.st.d': 'İhtilaflı', 'm.st.f': 'Yanlış',
      'm.s3.u': 'Kaynaklıdır ve arşivlidir, ama doğrulama kurallarını henüz karşılamaz. Yeni kayıtların varsayılanıdır ve çoğu kaydın uzun süre burada kalması beklenir. “Doğrulanmamış”, “yanlış” demek değildir; “kurallara göre henüz sınanmadı” demektir.',
      'm.s3.p': 'Olayın bir kısmı — genellikle yer ve zaman — doğrulandı, başka bir kısmı (faili, sonucu) doğrulanmadı. Hangi kısmın doğrulandığı özette yazılır.',
      'm.s3.v': 'Yandaki koşulların tamamını karşılar. Eşik bilerek yüksek tutulmuştur; kayıtların çoğunun uzun süre doğrulanmamış kalması beklenir ve kabul edilir.',
      'm.s3.d2': 'Güvenilir kaynaklar birbiriyle çelişiyor. Proje taraf tutmaz; iddiaları sahiplerine atfeder.',
      'm.s3.f2': 'İddianın yanlış olduğu gösterildi. Kayıt silinmez: aynı iddia yeniden dolaşıma girdiğinde başvurulacak referans olarak kalır.',
      'm.s3.rt': '“Doğrulanmış” için beş koşul',
      'm.s3.r1': 'Bilgi inandırıcılığı 1 veya 2.',
      'm.s3.r2': 'İngilizce başlık ve özet var.',
      'm.s3.r3': 'Her kaynağın çalışan bir arşiv bağlantısı var.',
      'm.s3.r4': 'En az iki bağımsız kaynak var; ya da geolokasyon, kronolokasyon veya uydu görüntüsüyle doğrulanmış ve yöntemi kayıtta yazılı.',
      'm.s3.r5': 'Kısıtlı lisanslı bir kaynak tek dayanak değil.',
      'm.s3.it': 'Bağımsız kaynak nedir?',
      'm.s3.id': 'İki kaynak, bilgiyi birbirinden ayrı yollarla elde ettiyse bağımsızdır. Aynı ajans haberini basan iki site tek kaynaktır; bir bakanlığın açıklamasını aktaran gazete de o bakanlıktır. Buna karşılık, çıkarları çatışan iki tarafın aynı olguyu doğrulaması güçlü bir doğrulamadır. Şüphedeysek bağımsızlık varsayılmaz; her kaynağın bilgiyi nereden aldığı izlenir.',
      'm.s4.k': 'Kırmızı çizgiler', 'm.s4.t': 'Sade dille kırmızı çizgiler',
      'm.s4.lead': 'Bu kurallar mutlaktır: istisnası, pazarlığı, “ama herkes paylaşıyor” gerekçesi yoktur. Bir kuralın uygulanıp uygulanmadığından emin değilsek, uygulanıyor sayar ve yayımlamayız.',
      'm.s4.tt': 'Türk kuvvetlerinin konumu neden hiç gösterilmiyor?',
      'm.s4.t1': 'Türk Silahlı Kuvvetleri, Jandarma, Sahil Güvenlik, Emniyet, MİT ve diğer Türk güvenlik unsurlarının konumu, hareketi, konuşlanması, düzeni, kabiliyet açığı veya zafiyeti hakkında hiçbir bilgi yayımlanmaz, toplanmaz, analiz edilmez. Türk askerî uçaklarının ve gemilerinin takip verisi izlenmez; sosyal medyada dolaşan konvoy ve tatbikat görüntüleri kamuya açık olsa bile kullanılmaz, bağlantısı verilmez, geolokasyonu yapılmaz.',
      'm.s4.t2': 'Nedeni, tek tek zararsız görünen parçaların birleşmesidir: açık kaynakta dağınık duran bilgiler bir araya geldiğinde hassas bir tablo çıkarabilir. Biz o tabloyu çizmeyiz.',
      'm.s4.t3': 'Tek istisna resmî açıklamalardır. Bunlar bile ancak koordinatsız, yalnızca il / ülke / deniz alanı hassasiyetinde, olaydan en az 24 saat sonra, yükseltilmiş hassasiyet işaretiyle ve bir bakımcının onayıyla yayımlanabilir. Yabancı bir kaynağın Türk kuvvetleri hakkındaki iddiası da aynı kurallara tabidir.',
      'm.s4.ot': 'Harekât bölgeleri neden yalnızca bütün alan olarak çiziliyor?',
      'm.s4.o1': 'Türk devletinin resmî olarak ilan ettiği harekât bölgeleri haritada gösterilebilir, çünkü ilan edilmiş bir kapsam bir birliğin konumu değildir: bunlar yıllardır kamuya açık, binlerce kilometrekarelik alanlardır ve sınır, bir harekâtın kapsamını gösterir.',
      'm.s4.o2': 'Bu yüzden yalnızca bölgenin tamamı çizilir. Üs, karakol, gözlem noktası, kontrol noktası; birlik adı veya gücü; konuşlanma ve hareket; bölge içinde herhangi bir nokta verisi yoktur ve olmayacaktır. Bölgeler bir cephe hattı değildir: her bölge bir durum ve durum tarihi taşır, sona ermiş bölgeler güncel kontrol gibi gösterilmez. Resmî TSK varlığı haritada yalnızca ülke düzeyinde kalır.',
      'm.s4.ol': 'Geri kalan çizgiler',
      'm.s4.l1': 'Gizli veya sızdırılmış materyal, hangi ülkeye ait olursa olsun, kaynak olarak kullanılmaz, alıntılanmaz, özetlenmez, bağlantısı verilmez. Bir olay yalnızca sızıntı üzerinden biliniyorsa kayda girmez.',
      'm.s4.l2': 'Sahada toplama yoktur. Kimse topluluk adına bir tesise gitmez, çekim yapmaz, drone uçurmaz; bilgi almak için görevlilerle veya tanıklarla temas kurmaz; kamuya açık olmayan hiçbir sisteme erişilmez.',
      'm.s4.l3': 'Özel kişilerin adı, yüzü, adresi, telefonu ve hesapları kayda girmez; hiçbir ülkenin alt kademe askerî personeli kimliklendirilmez. Doxxing yasaktır.',
      'm.s4.l4': 'Esirlerin, gözaltındakilerin, ölülerin veya yaralıların görüntüleri paylaşılmaz, bağlantısı verilmez, betimlenmez. Kayıp sayıları yalnızca metin olarak ve atfedilerek yazılır.',
      'm.s4.l5': 'Hedef gösteren, şiddete çağıran veya nefret içeren dil kullanılmaz. Koordinatlar bir olayın gerçekleştiği yeri belgelemek içindir; asla gelecekteki bir eylem için sunulmaz. Bir örgütün eylemleri o örgüte aittir, bir halka değil.',
      'm.s4.l6': 'Kaynaksız bilgi yazılmaz; telifli metin ve görsel kopyalanmaz. Tartışmalı her nitelendirme iddia olarak, sahibine atfedilerek kaydedilir.',
      'm.s4.note': 'Bu kuralların makinece denetlenebilenleri her değişiklikte otomatik olarak uygulanır, ama otomatik denetim insan incelemesinin yerine geçmez ve son sorumluluk insanındır. Bir ihlal fark ederseniz herkese açık bir yorumla dikkat çekmeyin — bu, içeriği daha görünür yapar; özel kanalı kullanın.',
      'm.s5.k': 'Harita', 'm.s5.t': 'Harita katmanları nereden geliyor?',
      'm.s5.lead': 'Harita Türkiye’nin bakış açısını açıkça gösterir, ama her unsur bir kaynağa ve açık bir etikete dayanır: okur, neyin resmî belge, neyin Türkiye’nin tutumu, neyin bizim çizimimiz olduğunu ayırt edebilmelidir.',
      'm.s5.l1': 'Her katmanın kaynaklı bir resmî belgesi olmalıdır: imzalı bir anlaşma, resmî koordinat listesi, Resmî Gazete veya bir BM belgesi. Kaynağı bulunamayan ülke boyanmaz; niyet beyanı, ziyaret veya basın yorumu yeterli değildir.',
      'm.s5.l2': 'Sınırlar Türkiye’nin tanımasına göre çizilir ve farkı açıklayan bir not taşır: Kırım Ukrayna’ya, Golan Suriye’ye, Somaliland Somali’ye bağlıdır.',
      'm.s5.l3': 'Deniz yetki alanları üç ayrı durumla gösterilir: anlaşmayla belirlenmiş sınırlar, Türkiye’nin BM’ye bildirdiği (itiraz edilen) hatlar ve şematik alanlar. KKTC ruhsat sahalarının köşeleri resmîdir; bu sahalar KKTC’nin ve Türkiye’nin tutumudur, GKRY ve Yunanistan itiraz eder.',
      'm.s5.l4': 'Dış temsilcilikler şehir düzeyinde gösterilir. 1961/1963 Viyana Sözleşmeleri gereği dokunulmazdırlar, ama Türk toprağı değildirler; site bunu böyle yazar.',
      'm.s5.l5': 'Konumu bilinmeyen olaylar haritada bölge düzeyinde bir halka olarak gösterilir. Konum uydurulmaz.',
      'm.s5.l6': 'Lisansı elvermeyen üçüncü taraf verisi kopyalanmaz ve hiçbir geometri telifli haritadan veya ekran görüntüsünden çizilmez. Kullanılan her kaynak; sürümü, erişim tarihi ve işleme adımlarıyla künyelenir. Katman üreticileri çıktıyı bayt bayt yeniden üretir.',
      'm.s5.st': '“Şematik” ne demek?',
      'm.s5.s1': 'Şematik etiketi taşıyan bir alan resmî koordinat değildir. Türkiye o alanın sınırlarını yayımlamamıştır; poligon, Türkiye’nin açıkladığı hukuki tutumdan bu projenin türettiği geometrik bir yapıdır. Şematik alanlar resmî hatlardan farklı biçimde çizilir, hem ekranda hem verinin içinde şematik olarak etiketlenir ve asla resmî koordinat gibi sunulmaz.',
      'm.s5.s2': 'Aynısı harekât bölgeleri için de geçerlidir: koordinat listesi yayımlanmamış bölgelerin sınırı, ilan edilen kapsama karşılık gelen idari birimlerden kurulur ve şematik olarak işaretlenir. Her şematik alanın yöntemi, ilgili kaynak dosyasında adım adım yazılıdır.',
      'm.s6.k': 'Lisans', 'm.s6.t': 'Lisans ve telif',
      'm.s6.lead': 'Verinin serbestçe kullanılmasını istiyoruz; ama kaynağın belirtilmesini ve üçüncü tarafların haklarının korunmasını da istiyoruz.',
      'm.s6.dataT': 'Veri ve içerik', 'm.s6.dataD': 'Kayıtlar, sözlükler, şemalar ve El Kitabı. Ticari kullanım dahil serbest; koşul atıftır.',
      'm.s6.codeT': 'Kod', 'm.s6.codeD': 'Bu site, harita üreticileri, toplayıcılar ve araçlar. Serbest; telif notu korunur.',
      'm.s6.p1': 'Atıf biçimi: “Greater Türkiye katkıcıları, CC BY 4.0” ve kullandığınız veri sürümü etiketi.',
      'm.s6.p2': 'Üçüncü taraf içeriği asla kopyalanmaz. Makale, rapor, görsel ve video depoya konmaz; kendi cümlelerimizle özet, bağlantı ve arşiv bağlantısı kullanılır. Kısa alıntı yalnızca bir iddiayı doğru aktarmak için, tırnak içinde ve kaynağıyla yapılır. Kayıttaki olgusal metin bizim derlememizdir; lisansladığımız şey odur, kaynakların ifadesi değil.',
      'm.s6.p3': 'Kısıtlı veya yeniden dağıtıma kapalı kaynakların verisi kopyalanmaz; bunlar yalnızca ipucu olarak kullanılır ve hiçbir kaydın tek kaynağı olamaz.',
      'm.s6.p4': 'Bir depoya katkı göndermek, katkının o deponun lisansıyla yayımlanmasını kabul etmek anlamına gelir. Gerçek ad bekleyen bir imza süreci istenmez; takma adla katkı böyle korunur.',
      'm.s6.p5': 'Bu sitenin kullandığı yazı tipleri, kütüphaneler ve harita verisi depoda barındırılır: site üçüncü taraflara istek göndermez, çerez kullanmaz, analitik çalıştırmaz. Her varlığın kaynağı, sürümü ve lisansı künye dosyasındadır.',
      'm.s7.k': 'Düzeltme', 'm.s7.t': 'Hata bulursanız',
      'm.s7.lead': 'Düzeltme, ilk yayından daha az görünür olmamalıdır. Yayımlanmış bir kayıtta hata varsa bize söyleyin: kayıt kimliğini, neyin yanlış olduğunu ve varsa doğrusunun kaynağını yazmanız yeter.',
      'm.s7.c1.t': 'Düzeltme bildir',
      'm.s7.c1.d': 'Yayımlanmış bir kayıttaki hata için hazır form. Kayıt kimliğini (ör. evt_…) ekleyin; panelde her kaydın ayrıntısında da aynı forma giden bir bağlantı vardır.',
      'm.s7.c1.a': 'Formu aç',
      'm.s7.c2.t': 'Olay öner',
      'm.s7.c2.d': 'Eksik olduğunu düşündüğünüz bir olayı kaynaklarıyla önerin. Öneri, yukarıdaki triyaj ve inceleme yolundan geçer.',
      'm.s7.c2.a': 'Formu aç',
      'm.s7.c3.t': 'Kaynak öner',
      'm.s7.c3.d': 'Sicile yeni bir kaynak önerin. Yeni kaynaklar F notuyla başlar; not ancak gerekçesi yazılmış bir incelemeyle değişir.',
      'm.s7.c3.a': 'Formu aç',
      'm.s7.c4.t': 'Hassas içerik',
      'm.s7.c4.d': 'Kişisel veri, sızıntı, Türk kuvvetlerine ait bilgi, esir görüntüsü veya hukuki kaldırma talebi için herkese açık issue kullanmayın. İçeriği alıntılamadan, yalnızca konumunu belirterek özel kanaldan yazın.',
      'm.s7.c4.a': 'Politikayı oku',
      'm.s7.note': 'Yanlış çıkan kayıtlar silinmez: geri çekildikleri açıkça işaretlenir, kimlikleri yeniden kullanılmaz ve aynı iddia yeniden dolaşıma girdiğinde referans olarak kalırlar. Kişisel veri veya gizli materyal söz konusuysa geçmiş de temizlenir; bu, “dosya silinmez” kuralının belgelenmiş tek istisnasıdır.',
      'm.lnk.hb01': 'El Kitabı 01 · Görev ve kapsam', 'm.lnk.hb02': 'El Kitabı 02 · Kırmızı çizgiler', 'm.lnk.hb03': 'El Kitabı 03 · Hukuk ve etik',
      'm.lnk.hb05': 'El Kitabı 05 · Doğrulama', 'm.lnk.hb06': 'El Kitabı 06 · Kaynak ve arşivleme', 'm.lnk.hb10': 'El Kitabı 10 · Katkı',
      'm.lnk.adr06': 'ADR 0006 · Doğrulama ölçeği', 'm.lnk.adr07': 'ADR 0007 · İnsan onaylı yayın', 'm.lnk.adr09': 'ADR 0009 · Lisanslama',
      'm.lnk.adr10': 'ADR 0010 · İçerik güvenliği kapıları', 'm.lnk.adr13': 'ADR 0013 · Harita katmanları', 'm.lnk.adr15': 'ADR 0015 · Harekât bölgeleri',
      'm.lnk.licenses': 'Üçüncü taraf varlıklar', 'm.lnk.maritime': 'Deniz alanları kaynakları', 'm.lnk.ops': 'Harekât bölgeleri kaynakları',
      'm.lnk.missions': 'Temsilcilik kaynakları', 'm.lnk.layers': 'Katman tablosu',
      'p.title': 'OSINT paneli', 'p.search': 'Ara', 'p.searchPh': 'Kayıtlarda ara…', 'p.region': 'Bölge', 'p.type': 'Tür', 'p.status': 'Durum', 'p.all': 'Tümü',
      'p.layers': 'Katmanlar', 'p.lyr.regions': 'Bölgeler', 'p.lyr.sites': 'Tesisler', 'p.lyr.events': 'Olaylar', 'p.lyr.examples': 'Örnek veriler',
      'p.feed': 'Kayıtlar', 'p.count': '{n} kayıt', 'p.cursor': 'İmleç', 'p.zoom': 'Ölçek',
      'p.demo': 'Gösterim modu: “ÖRNEK” etiketli kayıtlar kurgusaldır ve gerçek olayları anlatmaz.',
      'p.none': 'Filtreye uyan kayıt yok.', 'p.noreal': 'Henüz doğrulanmış olay kaydı yok. İlk kayıtları birlikte ekliyoruz.', 'p.addFirst': 'İlk kaydı öner',
      'p.err': 'Veri yüklenemedi.', 'p.retry': 'Tekrar dene', 'p.loading': 'Yükleniyor',
      'p.zoomIn': 'Yakınlaştır', 'p.zoomOut': 'Uzaklaştır', 'p.reset': 'Görünümü sıfırla', 'p.close': 'Kapat',
      'p.nogeo': 'koordinat yok', 'p.example': 'Örnek',
      'lg.unverified': 'Doğrulanmamış', 'lg.verified': 'Doğrulandı', 'lg.partial': 'Kısmen / tartışmalı', 'lg.example': 'Örnek (kurgusal)', 'lg.site': 'Tesis', 'lg.tr': 'Türkiye',
      'd.time': 'Zaman', 'd.location': 'Konum', 'd.regions': 'Bölgeler', 'd.countries': 'Devletler', 'd.actors': 'Aktörler', 'd.equipment': 'Teçhizat', 'd.claims': 'İddialar',
      'd.sources': 'Kaynaklar', 'd.assessment': 'Değerlendirme', 'd.id': 'Kimlik', 'd.type': 'Tür', 'd.operators': 'İşleten', 'd.country': 'Devlet',
      'd.github': 'GitHub’da görüntüle', 'd.correct': 'Düzeltme öner', 'd.copy': 'Kopyala', 'd.copied': 'Kopyalandı', 'd.archive': 'arşiv',
      'd.claimBy': '{actor} iddiası', 'd.exampleWarn': 'Bu kayıt KURGUSALDIR; yalnızca veri biçimini göstermek içindir.', 'd.method': 'Yöntem', 'd.basis': 'dayanak',
      'd.qty': 'adet',
    },
    en: {
      'a11y.skip': 'Skip to content', 'a11y.menu': 'Menu', 'a11y.lang': 'Language',
      'nav.panel': 'Dashboard', 'nav.data': 'Data', 'nav.handbook': 'Handbook', 'nav.join': 'Join', 'nav.open': 'Open dashboard', 'nav.home': 'Home',
      'hero.eyebrow': 'Open-source intelligence community',
      'hero.title1': 'Eyes on', 'hero.title2': 'the region',
      'hero.lead': 'We monitor Türkiye’s external security environment using public sources only. Every claim is sourced, archived and checked by a human reviewer, then published as open data that anyone can audit.',
      'hero.cta1': 'Open the dashboard', 'hero.cta2': 'Contribute',
      'hero.mapAria': 'Map of Türkiye and its neighbourhood, showing the watch regions',
      'hud.focus': 'Focus', 'hud.proj': 'Projection', 'hud.utc': 'UTC', 'hud.regions': 'Watch regions', 'hud.records': 'Records', 'hud.hover': 'Region',
      'ticker.label': 'Live feed', 'ticker.empty': 'The feed is just starting — we are adding the first records together', 'ticker.err': 'The data feed is currently unavailable',
      'regions.eyebrow': 'Watch regions', 'regions.title1': 'Looking', 'regions.title2': 'outward.',
      'regions.lead': 'Fourteen editorial watch regions. Each marks an area of interest, never a claim of sovereignty. Every contested characterisation is attributed to the party that makes it.',
      'regions.records': 'records', 'regions.open': 'Open in dashboard',
      'how.eyebrow': 'Method', 'how.title1': 'Collect. Verify.', 'how.title2': 'Review. Publish.',
      'how.lead': 'Accuracy before speed. Automation collects and sorts; a human always makes the call.',
      'how.1.t': 'Collect', 'how.1.d': 'Official statements, news agencies, NAVTEX/NOTAM notices, satellite and tracking services: public sources only.',
      'how.2.t': 'Verify', 'how.2.d': 'Admiralty scale: source reliability A–F, information credibility 1–6. No source counts as verified until it has been archived.',
      'how.3.t': 'Review', 'how.3.d': 'Every record is reviewed by a person. Labels such as “violation” or “provocation” are attributed to whoever uses them, never stated in our own voice.',
      'how.4.t': 'Publish', 'how.4.d': 'Openly licensed data in JSONL, CSV and GeoJSON. Nothing goes out without human approval, and corrections are announced publicly.',
      'stats.eyebrow': 'Open data', 'stats.title1': 'Every record', 'stats.title2': 'open to audit.',
      'stats.lead': 'Records live in Git, so every change is traceable. The data is open to everyone under CC BY 4.0.',
      'stats.event': 'Events', 'stats.source': 'Sources', 'stats.actor': 'Actors', 'stats.site': 'Sites', 'stats.equipment': 'Equipment types',
      'stats.note': 'Live count · from the datasets repository', 'stats.err': 'Unable to load data right now',
      'red.eyebrow': 'Red lines', 'red.title1': 'What we', 'red.title2': 'never do.',
      'red.lead': 'These rules are absolute, and automated checks enforce them too. When in doubt, we do not publish.',
      'red.1': 'We never share the positions or movements of Turkish forces.',
      'red.2': 'We never use classified or leaked material, whatever its country of origin.',
      'red.3': 'We never gather information on the ground near military zones.',
      'red.4': 'We never track private individuals or publish personal data.',
      'red.5': 'We never share images of prisoners of war or casualties.',
      'red.6': 'We never use language that targets, incites or spreads hatred.',
      'red.7': 'We never publish unsourced claims or copy copyrighted material.',
      'red.more': 'See all red lines',
      'join.eyebrow': 'Join', 'join.title1': 'Pseudonymous', 'join.title2': 'contributors welcome.',
      'join.lead': 'Data entry, source suggestions, translation, code or review. Start with the red lines and OPSEC pages, then pick a task.',
      'join.datasets.k': 'Data', 'join.datasets.t': 'datasets', 'join.datasets.d': 'Event, actor, site and source records, plus schemas and the validator.',
      'join.handbook.k': 'Method', 'join.handbook.t': 'handbook', 'join.handbook.d': 'Red lines, verification, OPSEC, style guide and decision records.',
      'join.platform.k': 'Code', 'join.platform.t': 'platform', 'join.platform.d': 'Collection, review and publishing infrastructure — including this site.',
      'join.github.k': 'Community', 'join.github.t': '.github', 'join.github.d': 'Code of conduct, governance, security policy and contributing guide.',
      'join.go': 'View repository', 'join.gfi': 'Good first issues', 'join.submit': 'Suggest an event', 'join.member': 'Join the community',
      'foot.tag': 'An open-source intelligence community covering Türkiye’s external security environment.',
      'foot.disclaimer': 'A volunteer community, not affiliated with any state body or political organisation.',
      'foot.community': 'Community', 'foot.data': 'Data', 'foot.project': 'Project',
      'foot.redlines': 'Red lines', 'foot.coc': 'Code of conduct', 'foot.security': 'Security & takedowns', 'foot.opsec': 'OPSEC',
      'foot.dataset': 'Dataset', 'foot.schemas': 'Schemas', 'foot.releases': 'Releases', 'foot.cite': 'Citation',
      'foot.roadmap': 'Roadmap', 'foot.license': 'Content & data: CC BY 4.0 · Code: MIT',
      /* method page */
      'nav.method': 'Method',
      'm.eyebrow': 'Method', 'm.title1': 'How far to', 'm.title2': 'trust this data.',
      'm.lead': 'This page explains how a record is made, the scale it is judged on, what we never publish and where every map layer comes from. It is not here to convince you: it is here to expose the method so you can judge for yourself. The rules are defined in the handbook; this page summarises them and links each section to its source.',
      'm.jump': 'Sections', 'm.src': 'Source',
      'm.s1.k': 'Scope', 'm.s1.t': 'What we claim, and what we do not',
      'm.s1.lead': 'We are a volunteer open-source intelligence community. We have no legal personality and no affiliation with any state body or political organisation. We work only with public, passive sources.',
      'm.s1.yes': 'What this project is',
      'm.s1.y1': 'An open compilation of records gathered from public sources, each of them resting on a source and an archive link.',
      'm.s1.y2': 'A dataset that states each record’s reliability openly: the source’s reliability and the information’s credibility are recorded separately.',
      'm.s1.y3': 'Open data kept in Git, where every change is traceable and anyone can audit it.',
      'm.s1.y4': 'A map that shows Türkiye’s official positions, each labelled as a position and linked to its source.',
      'm.s1.no': 'What this project is not',
      'm.s1.n1': 'It is not a news outlet. Speed comes second: when in doubt, we do not publish.',
      'm.s1.n2': 'It is not an early-warning or situational-awareness service. Records document events that have happened; nothing is ever presented for a future action.',
      'm.s1.n3': 'It is not an official source and it speaks for no state. Contested characterisations such as “violation”, “provocation” or “occupation” are never written in our own voice; they are recorded as claims, attributed to whoever makes them.',
      'm.s1.n4': 'It is not a force-tracking project. The positions and movements of Turkish forces are never published under any circumstances.',
      'm.s1.note': '“Verified” means the event happened. It does not mean a party’s characterisation of it is true: it can be verified that an aircraft flew in a given area, while whether that was a “violation” is attributed to the parties.',
      'm.s2.k': 'Pipeline', 'm.s2.t': 'How a record is made',
      'm.s2.lead': 'Automation collects and sorts; a human always makes the call. There are two gates on the way to publication, and people hold both.',
      'm.s2.1.t': 'Proposal',
      'm.s2.1.d': 'Anyone can suggest an event or a source through the public forms, and the collectors feed signals into the same queue. Anything that might involve personal data, a leak or Turkish forces goes through the private channel instead of a public issue: a public submission stays visible even when it is never merged.',
      'm.s2.2.t': 'Triage — gate 1',
      'm.s2.2.d': 'Raw signals are sifted in a private reviewer group. Rejected items are never shared anywhere. What passes becomes either a short bulletin, always tagged “UNVERIFIED”, or is marked to be turned into a record. The bot cannot merge its own submission.',
      'm.s2.3.t': 'Sources and archive',
      'm.s2.3.d': 'Every piece of information is tied to a source; the source enters the registry and is given a reliability grade. Without an archive link for every source, a record cannot count as verified. Primary sources — the Official Gazette, parliament, ministries, the UN — are preferred over media. Third-party text is never copied: we summarise it in our own words and give the link and an archive link.',
      'm.s2.4.t': 'Scale and automated gates',
      'm.s2.4.d': 'The record is given a source reliability (A–F), an information credibility (1–6) and a status. On every change, automated checks enforce the personal-data patterns, classification markings, the Turkish forces gate, the restricted-source rule and the format rules. Those checks cannot judge meaning: whether two sources are genuinely independent is a human decision.',
      'm.s2.5.t': 'Human approval — gate 2',
      'm.s2.5.d': 'A record enters the dataset only after a public review, and sensitive topics need a maintainer’s approval on top of that. Nothing is published without human approval. Maintainers can stop all automated publishing with a single setting. When a correction is added to a record, or a record is withdrawn, a correction note goes out to the channels that carried the original.',
      'm.s2.note': 'A bulletin is not a record: it is a short, attributed announcement, always tagged “unverified”, and it is not part of the dataset. Every bulletin either becomes a record or is closed with a withdrawal note.',
      'm.s3.k': 'Verification', 'm.s3.t': 'The verification scale',
      'm.s3.lead': 'Verification answers two separate questions, and the two are independent: a reliable source can relay false information, and an unreliable source can provide true information. The scale we use is the Admiralty (NATO) scale familiar across the OSINT and analysis community.',
      'm.s3.q1': 'How reliable is the source? A–F',
      'm.s3.q1d': 'Kept in the source registry. New sources start at F, and a grade changes only through a reviewed change with a written rationale. Official sources are not automatically A: a ministry speaking about its own losses or a contested incident is a party to it.',
      'm.s3.a': 'Completely reliable — no doubt about authenticity, trustworthiness or competence. In practice given very rarely.',
      'm.s3.b': 'Usually reliable — minor doubts; has provided valid information most of the time.',
      'm.s3.c': 'Fairly reliable — doubts; has provided valid information in the past.',
      'm.s3.d': 'Not usually reliable — significant doubts.',
      'm.s3.e': 'Unreliable — lacks authenticity and competence; a history of invalid information.',
      'm.s3.f': 'Reliability cannot be judged — no basis for evaluation. The default for new sources.',
      'm.s3.q2': 'How credible is the information? 1–6',
      'm.s3.q2d': 'Kept on the record itself. New records start at 6.',
      'm.s3.c1': 'Confirmed by other sources — confirmed by independent sources or visual/spatial evidence; logical and consistent.',
      'm.s3.c2': 'Probably true — not confirmed, but logical, consistent and in line with the known picture.',
      'm.s3.c3': 'Possibly true — not confirmed; reasonable but somewhat inconsistent or incomplete.',
      'm.s3.c4': 'Doubtful — possible but not logical; contrary information exists.',
      'm.s3.c5': 'Improbable — illogical and contradicted by other information.',
      'm.s3.c6': 'Truth cannot be judged — no basis for evaluation. The default for new records.',
      'm.s3.st': 'What the status means',
      'm.st.u': 'Unverified', 'm.st.p': 'Partially verified', 'm.st.v': 'Verified', 'm.st.d': 'Disputed', 'm.st.f': 'False',
      'm.s3.u': 'Sourced and archived, but it does not yet meet the verification rules. This is the default for new records, and most records are expected to stay here for a long time. “Unverified” does not mean “false”; it means “not yet tested against the rules”.',
      'm.s3.p': 'Part of the event — usually the place and time — is verified, while another part, such as who did it or what came of it, is not. The summary states which part is verified.',
      'm.s3.v': 'It meets every condition opposite. The threshold is deliberately high; most records are expected to stay unverified for a long time, and that is accepted.',
      'm.s3.d2': 'Reliable sources contradict each other. The project takes no side and attributes the claims to whoever makes them.',
      'm.s3.f2': 'The claim has been shown to be false. The record is not deleted: it stays as a reference for when the same claim circulates again.',
      'm.s3.rt': 'Five conditions for “verified”',
      'm.s3.r1': 'Information credibility is 1 or 2.',
      'm.s3.r2': 'An English title and summary exist.',
      'm.s3.r3': 'Every source has a working archive link.',
      'm.s3.r4': 'There are at least two independent sources, or the record is verified by geolocation, chronolocation or satellite imagery with the method written into the record.',
      'm.s3.r5': 'No restricted-licence source is the sole basis.',
      'm.s3.it': 'What counts as an independent source?',
      'm.s3.id': 'Two sources are independent if they obtained the information through separate paths. Two sites running the same wire story are one source, and a newspaper relaying a ministry statement is the ministry. Two parties with conflicting interests confirming the same fact, on the other hand, is a strong confirmation. When in doubt, independence is not assumed; we trace where each source got its information.',
      'm.s4.k': 'Red lines', 'm.s4.t': 'The red lines, in plain language',
      'm.s4.lead': 'These rules are absolute: no exceptions, no bargaining and no “but everyone is sharing it”. If we are unsure whether a rule applies, we assume it does and do not publish.',
      'm.s4.tt': 'Why positions of Turkish forces are never shown',
      'm.s4.t1': 'Nothing is published, collected or analysed about the positions, movements, deployments, order of battle, capability gaps or vulnerabilities of the Turkish Armed Forces, the Gendarmerie, the Coast Guard, the Police, MİT or any other Turkish security body. Tracking data of Turkish military aircraft and naval vessels is not followed, and convoy or exercise footage circulating on social media is not used, linked or geolocated, even when it is public.',
      'm.s4.t2': 'The reason is that individually harmless pieces add up: information scattered across open sources can, once aggregated, produce a sensitive picture. We do not draw that picture.',
      'm.s4.t3': 'The only exception is official disclosures, and even those may be published only without coordinates, at province, country or sea-area precision, at least 24 hours after the event, marked as elevated sensitivity and approved by a maintainer. A foreign source’s claim about Turkish forces is subject to the same rules.',
      'm.s4.ot': 'Why operation areas appear only as whole areas',
      'm.s4.o1': 'Operation areas officially announced by the Turkish state may be shown on the map, because an announced scope is not a unit’s position: these are areas of thousands of square kilometres, public for years, and the boundary shows the extent of an operation.',
      'm.s4.o2': 'That is why only the whole area is drawn. There are no bases, outposts, observation posts or checkpoints, no unit names or strengths, no deployments or movements and no point data inside a zone — and there never will be. The zones are not a front line: each carries a status and an as-of date, and zones that have ended are not styled as current control. Official Turkish military presence stays at country level on the map.',
      'm.s4.ol': 'The remaining lines',
      'm.s4.l1': 'Classified or leaked material is never used as a source, quoted, summarised or linked, whatever country it belongs to. If an event is known only through a leak, it does not enter the dataset.',
      'm.s4.l2': 'There is no field collection. Nobody visits a facility, films or flies a drone on behalf of the community, nobody contacts officials or witnesses to obtain information, and no non-public system is ever accessed.',
      'm.s4.l3': 'The names, faces, addresses, phone numbers and accounts of private individuals never enter a record, and junior military personnel of any country are never identified. Doxxing is prohibited.',
      'm.s4.l4': 'Images of prisoners, detainees, the dead or the wounded are not shared, linked or described. Casualty figures are recorded as attributed text only.',
      'm.s4.l5': 'No language that designates targets, calls for violence or spreads hatred. Coordinates document where an event happened; they are never presented for a future action. An organisation’s actions belong to that organisation, not to a people.',
      'm.s4.l6': 'Nothing is written without a source, and copyrighted text or imagery is never copied. Every contested characterisation is recorded as a claim, attributed to whoever makes it.',
      'm.s4.note': 'The machine-checkable part of these rules is enforced automatically on every change, but automated checks never replace human review and final responsibility lies with people. If you notice a violation, do not draw attention to it in a public comment — that makes the content more visible; use the private channel.',
      'm.s5.k': 'Map', 'm.s5.t': 'Where the map layers come from',
      'm.s5.lead': 'The map shows Türkiye’s perspective openly, but every element rests on a source and an explicit label: a reader must be able to tell what is an official document, what is Türkiye’s position and what is our own drawing.',
      'm.s5.l1': 'Every layer needs a sourced official document: a signed agreement, an official coordinate list, the Official Gazette or a UN document. A country for which no source can be found is not coloured; a declaration of intent, a visit or press commentary is not enough.',
      'm.s5.l2': 'Borders are drawn as Türkiye recognises them, each carrying a note that explains the difference: Crimea with Ukraine, the Golan with Syria, Somaliland with Somalia.',
      'm.s5.l3': 'Maritime areas are shown with three distinct statuses: limits set by agreement, the limits Türkiye has notified to the UN (which are contested), and schematic areas. The corners of the TRNC licence areas are official; those areas are the TRNC’s and Türkiye’s position, contested by the Greek Cypriot Administration and Greece.',
      'm.s5.l4': 'Diplomatic missions are shown at city level. They are inviolable under the 1961/1963 Vienna Conventions, but they are not Turkish territory, and the site says so.',
      'm.s5.l5': 'Events with no known location are drawn as a ring at region level. A location is never invented.',
      'm.s5.l6': 'Third-party data whose licence does not allow it is never copied, and no geometry is ever traced from a copyrighted map or a screenshot. Every source we do use is credited with its version, retrieval date and processing steps. The layer builders reproduce their output byte for byte.',
      'm.s5.st': 'What “schematic” means',
      'm.s5.s1': 'An area labelled schematic is not an official coordinate list. Türkiye has not published that area’s boundaries; the polygon is this project’s geometric construction from Türkiye’s stated legal position. Schematic areas are styled differently from official limits, labelled as schematic both on screen and inside the data, and never presented as official coordinates.',
      'm.s5.s2': 'The same holds for the operation areas: where no coordinate list has been published, the boundary is built from the administrative units matching the announced scope and marked as schematic. The method behind every schematic area is written out step by step in its source file.',
      'm.s6.k': 'Licence', 'm.s6.t': 'Licensing and copyright',
      'm.s6.lead': 'We want the data to be reused freely — and we want the source to be credited and third-party rights respected.',
      'm.s6.dataT': 'Data and content', 'm.s6.dataD': 'Records, vocabularies, schemas and the handbook. Free to reuse, commercially too; the condition is attribution.',
      'm.s6.codeT': 'Code', 'm.s6.codeD': 'This site, the map builders, the collectors and the tools. Free to reuse; the copyright notice is kept.',
      'm.s6.p1': 'Attribution format: “Greater Türkiye contributors, CC BY 4.0”, together with the data version tag you used.',
      'm.s6.p2': 'Third-party content is never copied. Articles, reports, images and videos are not committed to the repository: we use a summary in our own words, a link and an archive link. A short quotation is used only to relay a claim accurately, in quotation marks and with its source. The factual text in a record is our own compilation, and that is what we license — not the wording of the sources.',
      'm.s6.p3': 'Data from restricted or no-redistribution sources is never copied; such sources are used only as leads and can never be the sole source of a record.',
      'm.s6.p4': 'Opening a contribution to a repository means agreeing that it is published under that repository’s licence. No sign-off process that expects a real name is required, which is how pseudonymous contribution is protected.',
      'm.s6.p5': 'The fonts, libraries and map data this site uses are all hosted in the repository: the site makes no third-party requests, sets no cookies and runs no analytics. Every asset’s source, version and licence is listed in the credits file.',
      'm.s7.k': 'Corrections', 'm.s7.t': 'If you find an error',
      'm.s7.lead': 'A correction must be at least as visible as the original. If a published record is wrong, tell us: the record ID, what is wrong and, if you have one, a source for what is right.',
      'm.s7.c1.t': 'Report a correction',
      'm.s7.c1.d': 'The ready-made form for an error in a published record. Include the record ID (e.g. evt_…); every record’s detail view in the dashboard links to the same form.',
      'm.s7.c1.a': 'Open the form',
      'm.s7.c2.t': 'Suggest an event',
      'm.s7.c2.d': 'Suggest an event you think is missing, with its sources. The suggestion goes through the triage and review path above.',
      'm.s7.c2.a': 'Open the form',
      'm.s7.c3.t': 'Suggest a source',
      'm.s7.c3.d': 'Propose a new source for the registry. New sources start at grade F, and the grade changes only through a reviewed change with a written rationale.',
      'm.s7.c3.a': 'Open the form',
      'm.s7.c4.t': 'Sensitive content',
      'm.s7.c4.d': 'For personal data, a leak, information on Turkish forces, imagery of prisoners or a legal takedown request, do not use a public issue. Write through the private channel, quoting nothing and giving only the location of the content.',
      'm.s7.c4.a': 'Read the policy',
      'm.s7.note': 'Records that turn out to be false are not deleted: they are clearly marked as withdrawn, their ID is never reused, and they remain as a reference for when the same claim returns. Where personal data or classified material is involved, the history is purged as well — the one documented exception to the “files are never deleted” rule.',
      'm.lnk.hb01': 'Handbook 01 · Mission and scope', 'm.lnk.hb02': 'Handbook 02 · Red lines', 'm.lnk.hb03': 'Handbook 03 · Law and ethics',
      'm.lnk.hb05': 'Handbook 05 · Verification', 'm.lnk.hb06': 'Handbook 06 · Sourcing and archiving', 'm.lnk.hb10': 'Handbook 10 · Contributing',
      'm.lnk.adr06': 'ADR 0006 · Verification scale', 'm.lnk.adr07': 'ADR 0007 · Human-in-the-loop publishing', 'm.lnk.adr09': 'ADR 0009 · Licensing',
      'm.lnk.adr10': 'ADR 0010 · Content safety gates', 'm.lnk.adr13': 'ADR 0013 · Map layers', 'm.lnk.adr15': 'ADR 0015 · Operation areas',
      'm.lnk.licenses': 'Third-party assets', 'm.lnk.maritime': 'Maritime sources', 'm.lnk.ops': 'Operation area sources',
      'm.lnk.missions': 'Mission sources', 'm.lnk.layers': 'Layer table',
      'p.title': 'OSINT dashboard', 'p.search': 'Search', 'p.searchPh': 'Search records…', 'p.region': 'Region', 'p.type': 'Type', 'p.status': 'Status', 'p.all': 'All',
      'p.layers': 'Layers', 'p.lyr.regions': 'Regions', 'p.lyr.sites': 'Sites', 'p.lyr.events': 'Events', 'p.lyr.examples': 'Example data',
      'p.feed': 'Records', 'p.count': '{n} records', 'p.cursor': 'Cursor', 'p.zoom': 'Zoom',
      'p.demo': 'Demo mode: records marked “EXAMPLE” are fictional and do not describe real events.',
      'p.none': 'No records match these filters.', 'p.noreal': 'No verified event records yet — we are adding the first ones together.', 'p.addFirst': 'Suggest the first record',
      'p.err': 'Unable to load data.', 'p.retry': 'Try again', 'p.loading': 'Loading',
      'p.zoomIn': 'Zoom in', 'p.zoomOut': 'Zoom out', 'p.reset': 'Reset view', 'p.close': 'Close',
      'p.nogeo': 'no coordinates', 'p.example': 'Example',
      'lg.unverified': 'Unverified', 'lg.verified': 'Verified', 'lg.partial': 'Partial / disputed', 'lg.example': 'Example (fictional)', 'lg.site': 'Site', 'lg.tr': 'Türkiye',
      'd.time': 'Time', 'd.location': 'Location', 'd.regions': 'Regions', 'd.countries': 'States', 'd.actors': 'Actors', 'd.equipment': 'Equipment', 'd.claims': 'Claims',
      'd.sources': 'Sources', 'd.assessment': 'Assessment', 'd.id': 'ID', 'd.type': 'Type', 'd.operators': 'Operator', 'd.country': 'State',
      'd.github': 'View on GitHub', 'd.correct': 'Suggest a correction', 'd.copy': 'Copy', 'd.copied': 'Copied', 'd.archive': 'archive',
      'd.claimBy': 'Claimed by {actor}', 'd.exampleWarn': 'This record is FICTIONAL and exists only to illustrate the data format.', 'd.method': 'Method', 'd.basis': 'basis',
      'd.qty': 'units',
    },
  };

  GT.t = (key, vars) => {
    let s = (I18N[GT.lang] && I18N[GT.lang][key]) ?? I18N.tr[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
    return s;
  };
  GT.txt = (o) => (!o ? '' : typeof o === 'string' ? o : o[GT.lang] || o.tr || o.en || '');
  GT.upper = (s) => String(s).toLocaleUpperCase(GT.lang === 'tr' ? 'tr-TR' : 'en-GB');

  GT.applyI18n = () => {
    document.documentElement.lang = GT.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = GT.t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = GT.t(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', GT.t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === GT.lang)));
  };
  GT.setLang = (lang) => {
    GT.lang = lang;
    store.set('gt-lang', lang);
    GT.applyI18n();
    document.dispatchEvent(new CustomEvent('gt:lang'));
  };

  GT.initChrome = () => {
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => GT.setLang(b.dataset.lang)));
    const burger = document.querySelector('.nav-burger');
    const nav = document.querySelector('.site-nav');
    if (burger && nav) {
      burger.addEventListener('click', () => burger.setAttribute('aria-expanded', String(nav.classList.toggle('open'))));
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
    }
    const header = document.querySelector('.site-header:not(.is-panel)');
    if (header) {
      const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    GT.applyI18n();
  };

  /* reveal-on-scroll for elements marked .rv; reduced motion shows everything at once */
  GT.initReveal = () => {
    const els = document.querySelectorAll('.rv');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
  };

  GT.clock = (el) => {
    if (!el) return;
    const tick = () => { el.textContent = new Date().toISOString().slice(11, 19) + 'Z'; };
    tick();
    setInterval(tick, 1000);
  };

  GT.el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  GT.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------------- data ---------------- */
  async function getText(path) {
    const r = await fetch(GT.DATA_BASE + path, { cache: 'no-cache' });
    if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
    return r.text();
  }
  const jsonl = (s) => s.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const KINDS = ['event', 'actor', 'site', 'source', 'equipment', 'examples'];

  GT.loadData = async () => {
    const [manifest, vocab, ...lists] = await Promise.all([
      getText('manifest.json').then(JSON.parse),
      getText('vocab.json').then(JSON.parse),
      ...KINDS.map((k) => getText(k + '.jsonl').then(jsonl).catch(() => [])),
    ]);
    const d = { manifest, vocab, byId: new Map() };
    KINDS.forEach((k, i) => { d[k] = lists[i]; });
    d.examples.forEach((r) => { r._example = true; });
    for (const k of KINDS) for (const r of d[k]) d.byId.set(r.id, r);
    GT.vocab = vocab;
    return d;
  };

  GT.label = (vocabName, code) => {
    const list = GT.vocab && GT.vocab[vocabName];
    const hit = list && list.find((c) => c.code === code);
    if (hit) return GT.txt(hit.label);
    if (vocabName === 'regions' && REGIONS[code]) return GT.txt(REGIONS[code].label);
    return code;
  };
  GT.definition = (vocabName, code) => {
    const list = GT.vocab && GT.vocab[vocabName];
    const hit = list && list.find((c) => c.code === code);
    if (hit && hit.definition) return GT.txt(hit.definition);
    return vocabName === 'regions' && REGIONS[code] ? GT.txt(REGIONS[code].def) : '';
  };

  /* IDs are TypeID-style: prefix + 26 base32 chars of a UUIDv7; the top 48 bits are the creation time. */
  const ALPHA = '0123456789abcdefghjkmnpqrstvwxyz';
  const DIRS = { evt: 'events', act: 'actors', sit: 'sites', eqp: 'equipment', src: 'sources' };
  GT.idTime = (id) => {
    let n = 0n;
    for (const c of id.split('_')[1]) n = n * 32n + BigInt(ALPHA.indexOf(c));
    return new Date(Number(n >> 80n));
  };
  GT.recordPath = (rec) => {
    const t = GT.idTime(rec.id);
    const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
    return `${rec._example ? 'examples' : 'data'}/${DIRS[rec.id.slice(0, 3)]}/${t.getUTCFullYear()}/${mm}/${rec.id}.yaml`;
  };
  GT.recordUrl = (rec) => `${GT.REPO}/datasets/blob/main/${GT.recordPath(rec)}`;

  // Building an Intl.DateTimeFormat costs milliseconds; a feed or a ticker asks for the same handful of
  // language-and-precision combinations over and over, so they are kept.
  const dtf = new Map();
  const formatter = (loc, precision, opts) => {
    const k = loc + '|' + precision;
    let f = dtf.get(k);
    if (!f) dtf.set(k, (f = new Intl.DateTimeFormat(loc, opts)));
    return f;
  };
  GT.fmtTime = (iso, precision) => {
    if (!iso) return '';
    const t = new Date(iso);
    if (isNaN(t)) return iso;
    const loc = GT.lang === 'tr' ? 'tr-TR' : 'en-GB';
    const opts = { timeZone: 'UTC', year: 'numeric' };
    if (precision !== 'year') opts.month = 'short';
    if (precision === 'day' || precision === 'hour' || precision === 'minute') opts.day = '2-digit';
    let s = formatter(loc, precision, opts).format(t);
    if (precision === 'hour' || precision === 'minute') s += ' · ' + t.toISOString().slice(11, 16) + 'Z';
    return s;
  };

  GT.STATUS = {
    unverified: { tr: 'Doğrulanmamış', en: 'Unverified' },
    partially_verified: { tr: 'Kısmen doğrulandı', en: 'Partially verified' },
    verified: { tr: 'Doğrulandı', en: 'Verified' },
    disputed: { tr: 'Tartışmalı', en: 'Disputed' },
    false: { tr: 'Yanlış', en: 'False' },
  };
  GT.CREDIBILITY = {
    1: { tr: 'Teyit edilmiş', en: 'Confirmed' }, 2: { tr: 'Muhtemelen doğru', en: 'Probably true' }, 3: { tr: 'Olası', en: 'Possibly true' },
    4: { tr: 'Şüpheli', en: 'Doubtful' }, 5: { tr: 'İhtimal dışı', en: 'Improbable' }, 6: { tr: 'Değerlendirilemez', en: 'Cannot be judged' },
  };
  GT.RELIABILITY = {
    A: { tr: 'Tamamen güvenilir', en: 'Completely reliable' }, B: { tr: 'Genellikle güvenilir', en: 'Usually reliable' }, C: { tr: 'Oldukça güvenilir', en: 'Fairly reliable' },
    D: { tr: 'Genellikle güvenilmez', en: 'Not usually reliable' }, E: { tr: 'Güvenilmez', en: 'Unreliable' }, F: { tr: 'Değerlendirilemez', en: 'Cannot be judged' },
  };
  GT.PRECISION = {
    exact: { tr: 'Kesin', en: 'Exact' }, site: { tr: 'Tesis', en: 'Site' }, locality: { tr: 'Yerleşim', en: 'Locality' }, admin2: { tr: 'İlçe', en: 'District' },
    admin1: { tr: 'İl / eyalet', en: 'Province / state' }, country: { tr: 'Ülke', en: 'Country' }, 'sea-area': { tr: 'Deniz alanı', en: 'Sea area' },
  };
  GT.ROLE = {
    perpetrator: { tr: 'fail', en: 'perpetrator' }, participant: { tr: 'katılımcı', en: 'participant' }, target: { tr: 'hedef', en: 'target' },
    claimant: { tr: 'iddia sahibi', en: 'claimant' }, reporter: { tr: 'bildiren', en: 'reporter' }, host: { tr: 'ev sahibi', en: 'host' },
    buyer: { tr: 'alıcı', en: 'buyer' }, seller: { tr: 'satıcı', en: 'seller' },
  };
  GT.DOMAIN = {
    exercise: { tr: 'Tatbikat', en: 'Exercise' }, deployment: { tr: 'Konuşlanma', en: 'Deployment' }, basing: { tr: 'Üs / tesis', en: 'Basing' },
    procurement: { tr: 'Tedarik', en: 'Procurement' }, test: { tr: 'Test', en: 'Test' }, kinetic: { tr: 'Kinetik', en: 'Kinetic' },
    air: { tr: 'Hava', en: 'Air' }, maritime: { tr: 'Deniz', en: 'Maritime' }, cyber: { tr: 'Siber', en: 'Cyber' },
    diplomatic: { tr: 'Diplomatik', en: 'Diplomatic' }, policy: { tr: 'Politika', en: 'Policy' }, other: { tr: 'Diğer', en: 'Other' },
  };

  /* ---------------- geography ---------------- */
  // world-atlas (Natural Earth, public domain) numeric ids -> ISO alpha-3, plus features without an ISO id.
  const NUM = {
    '792': 'TUR', '300': 'GRC', '196': 'CYP', '760': 'SYR', '368': 'IRQ', '364': 'IRN', '376': 'ISR', '275': 'PSE', '422': 'LBN', '400': 'JOR',
    '051': 'ARM', '031': 'AZE', '268': 'GEO', '643': 'RUS', '804': 'UKR', '498': 'MDA', '112': 'BLR', '100': 'BGR', '642': 'ROU', '688': 'SRB',
    '499': 'MNE', '807': 'MKD', '008': 'ALB', '070': 'BIH', '191': 'HRV', '705': 'SVN', '348': 'HUN', '434': 'LBY', '818': 'EGY', '788': 'TUN',
    '012': 'DZA', '504': 'MAR', '729': 'SDN', '682': 'SAU', '784': 'ARE', '634': 'QAT', '414': 'KWT', '048': 'BHR', '512': 'OMN', '887': 'YEM',
    '706': 'SOM', '262': 'DJI', '232': 'ERI', '231': 'ETH', '398': 'KAZ', '860': 'UZB', '795': 'TKM', '417': 'KGZ', '762': 'TJK', '004': 'AFG',
    '586': 'PAK', '380': 'ITA', '470': 'MLT', '360': 'IDN', '404': 'KEN', '566': 'NGA', '562': 'NER',
    // NATO allies and signed framework / defence-industry partners outside the region
    '056': 'BEL', '124': 'CAN', '203': 'CZE', '208': 'DNK', '233': 'EST', '246': 'FIN', '250': 'FRA', '276': 'DEU', '352': 'ISL', '428': 'LVA',
    '440': 'LTU', '442': 'LUX', '528': 'NLD', '578': 'NOR', '616': 'POL', '620': 'PRT', '703': 'SVK', '724': 'ESP', '752': 'SWE', '826': 'GBR',
    '840': 'USA', '076': 'BRA', '170': 'COL', '458': 'MYS', '148': 'TCD', '686': 'SEN', '768': 'TGO', '270': 'GMB', '694': 'SLE', '508': 'MOZ',
    '024': 'AGO', '180': 'COD', '716': 'ZWE', '800': 'UGA', '834': 'TZA', '226': 'GNQ', '854': 'BFA', '466': 'MLI',
  };
  // Somaliland is not recognised by Türkiye: it is drawn as part of Somalia.
  const NAMELESS = { 'N. Cyprus': 'XNC', Kosovo: 'XKX', Somaliland: 'SOM' };
  const NAMES = {
    TUR: ['Türkiye', 'Türkiye'], GRC: ['Yunanistan', 'Greece'], CYP: ['GKRY', 'Greek Cypriot Admin.'], XNC: ['KKTC', 'TRNC'], SYR: ['Suriye', 'Syria'],
    IRQ: ['Irak', 'Iraq'], IRN: ['İran', 'Iran'], ISR: ['İsrail', 'Israel'], PSE: ['Filistin', 'Palestine'], LBN: ['Lübnan', 'Lebanon'], JOR: ['Ürdün', 'Jordan'],
    ARM: ['Ermenistan', 'Armenia'], AZE: ['Azerbaycan', 'Azerbaijan'], GEO: ['Gürcistan', 'Georgia'], RUS: ['Rusya', 'Russia'], UKR: ['Ukrayna', 'Ukraine'],
    MDA: ['Moldova', 'Moldova'], BLR: ['Belarus', 'Belarus'], BGR: ['Bulgaristan', 'Bulgaria'], ROU: ['Romanya', 'Romania'], SRB: ['Sırbistan', 'Serbia'],
    MNE: ['Karadağ', 'Montenegro'], MKD: ['K. Makedonya', 'N. Macedonia'], ALB: ['Arnavutluk', 'Albania'], XKX: ['Kosova', 'Kosovo'], BIH: ['Bosna-Hersek', 'Bosnia-Herz.'],
    HRV: ['Hırvatistan', 'Croatia'], SVN: ['Slovenya', 'Slovenia'], HUN: ['Macaristan', 'Hungary'], LBY: ['Libya', 'Libya'], EGY: ['Mısır', 'Egypt'],
    TUN: ['Tunus', 'Tunisia'], DZA: ['Cezayir', 'Algeria'], MAR: ['Fas', 'Morocco'], SDN: ['Sudan', 'Sudan'], SAU: ['Suudi Arabistan', 'Saudi Arabia'],
    ARE: ['BAE', 'UAE'], QAT: ['Katar', 'Qatar'], KWT: ['Kuveyt', 'Kuwait'], BHR: ['Bahreyn', 'Bahrain'], OMN: ['Umman', 'Oman'], YEM: ['Yemen', 'Yemen'],
    SOM: ['Somali', 'Somalia'], SML: ['Somaliland', 'Somaliland'], DJI: ['Cibuti', 'Djibouti'], ERI: ['Eritre', 'Eritrea'], ETH: ['Etiyopya', 'Ethiopia'],
    KAZ: ['Kazakistan', 'Kazakhstan'], UZB: ['Özbekistan', 'Uzbekistan'], TKM: ['Türkmenistan', 'Turkmenistan'], KGZ: ['Kırgızistan', 'Kyrgyzstan'],
    TJK: ['Tacikistan', 'Tajikistan'], AFG: ['Afganistan', 'Afghanistan'], PAK: ['Pakistan', 'Pakistan'], ITA: ['İtalya', 'Italy'], MLT: ['Malta', 'Malta'],
    IDN: ['Endonezya', 'Indonesia'], KEN: ['Kenya', 'Kenya'], NGA: ['Nijerya', 'Nigeria'], NER: ['Nijer', 'Niger'],
    BEL: ['Belçika', 'Belgium'], CAN: ['Kanada', 'Canada'], CZE: ['Çekya', 'Czechia'], DNK: ['Danimarka', 'Denmark'], EST: ['Estonya', 'Estonia'],
    FIN: ['Finlandiya', 'Finland'], FRA: ['Fransa', 'France'], DEU: ['Almanya', 'Germany'], ISL: ['İzlanda', 'Iceland'], LVA: ['Letonya', 'Latvia'],
    LTU: ['Litvanya', 'Lithuania'], LUX: ['Lüksemburg', 'Luxembourg'], NLD: ['Hollanda', 'Netherlands'], NOR: ['Norveç', 'Norway'], POL: ['Polonya', 'Poland'],
    PRT: ['Portekiz', 'Portugal'], SVK: ['Slovakya', 'Slovakia'], ESP: ['İspanya', 'Spain'], SWE: ['İsveç', 'Sweden'], GBR: ['Birleşik Krallık', 'United Kingdom'],
    USA: ['ABD', 'United States'], BRA: ['Brezilya', 'Brazil'], COL: ['Kolombiya', 'Colombia'], MYS: ['Malezya', 'Malaysia'], TCD: ['Çad', 'Chad'],
    SEN: ['Senegal', 'Senegal'], TGO: ['Togo', 'Togo'], GMB: ['Gambiya', 'Gambia'], SLE: ['Sierra Leone', 'Sierra Leone'], MOZ: ['Mozambik', 'Mozambique'],
    AGO: ['Angola', 'Angola'], COD: ['KDC', 'DR Congo'], ZWE: ['Zimbabve', 'Zimbabwe'], UGA: ['Uganda', 'Uganda'], TZA: ['Tanzanya', 'Tanzania'],
    GNQ: ['Ekvator Ginesi', 'Equatorial Guinea'], BFA: ['Burkina Faso', 'Burkina Faso'], MLI: ['Mali', 'Mali'],
  };

  // Editorial watch regions (vocab/regions.yaml is canonical; this adds map geometry hints).
  const REGIONS = {
    syria: { label: { tr: 'Suriye', en: 'Syria' }, def: { tr: 'Suriye toprakları ve hava sahası.', en: 'Syrian territory and airspace.' }, countries: ['SYR'], bbox: [[35.5, 32.3], [42.4, 37.4]], at: [38.6, 35.1] },
    iraq: { label: { tr: 'Irak', en: 'Iraq' }, def: { tr: 'Kuzey Irak dahil Irak toprakları.', en: 'Iraqi territory, including northern Iraq.' }, countries: ['IRQ'], bbox: [[38.8, 29], [48.6, 37.4]], at: [43.6, 33] },
    iran: { label: { tr: 'İran', en: 'Iran' }, def: { tr: 'İran ve bölgesel askerî faaliyetleri.', en: 'Iran and its regional military activity.' }, countries: ['IRN'], bbox: [[44, 25], [63.4, 39.8]], at: [53.8, 32.4] },
    levant: { label: { tr: 'Levant', en: 'Levant' }, def: { tr: 'İsrail, Filistin, Lübnan, Ürdün.', en: 'Israel, Palestine, Lebanon, Jordan.' }, countries: ['ISR', 'PSE', 'LBN', 'JOR'], bbox: [[34.2, 29.2], [39.3, 34.7]], at: [36.9, 31] },
    caucasus: { label: { tr: 'Kafkasya', en: 'Caucasus' }, def: { tr: 'Azerbaycan, Ermenistan, Gürcistan ve Kuzey Kafkasya.', en: 'Azerbaijan, Armenia, Georgia and the North Caucasus.' }, countries: ['ARM', 'AZE', 'GEO'], bbox: [[39.9, 38.3], [50.5, 43.7]], at: [45.4, 41.3] },
    aegean: { label: { tr: 'Ege', en: 'Aegean' }, def: { tr: 'Ege Denizi, adalar ve hava sahası.', en: 'The Aegean Sea, its islands and airspace.' }, countries: ['GRC'], bbox: [[22.5, 35], [28.5, 41]], at: [25.2, 37.6] },
    'east-med': { label: { tr: 'Doğu Akdeniz', en: 'Eastern Mediterranean' }, def: { tr: 'Deniz yetki alanları ve enerji sahaları.', en: 'Maritime jurisdiction areas and energy fields.' }, countries: [], bbox: [[27, 31], [36.5, 37]], at: [30.2, 33.4] },
    cyprus: { label: { tr: 'Kıbrıs', en: 'Cyprus' }, def: { tr: 'Kıbrıs adası (KKTC ve GKRY).', en: 'The island of Cyprus (TRNC and Greek Cypriot Administration).' }, countries: ['CYP', 'XNC'], bbox: [[32.2, 34.5], [34.7, 35.8]], at: [33.3, 34.5] },
    'black-sea': { label: { tr: 'Karadeniz', en: 'Black Sea' }, def: { tr: 'Karadeniz ve kıyı devletlerinin deniz/hava faaliyeti.', en: 'The Black Sea and the naval and air activity of its littoral states.' }, countries: [], bbox: [[27.4, 40.8], [41.8, 47.3]], at: [34.6, 43.6] },
    'libya-north-africa': { label: { tr: 'Libya ve Kuzey Afrika', en: 'Libya and North Africa' }, def: { tr: 'Libya, Mısır, Tunus, Cezayir, Fas.', en: 'Libya, Egypt, Tunisia, Algeria, Morocco.' }, countries: ['LBY', 'EGY', 'TUN', 'DZA', 'MAR'], bbox: [[-9, 19.5], [37, 37.5]], at: [18, 27.5] },
    'gulf-red-sea': { label: { tr: 'Körfez ve Kızıldeniz', en: 'Gulf and Red Sea' }, def: { tr: 'Basra Körfezi, Kızıldeniz, Yemen ve Afrika Boynuzu.', en: 'Persian Gulf, Red Sea, Yemen and the Horn of Africa.' }, countries: ['SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'YEM', 'SOM', 'SML', 'DJI', 'ERI', 'SDN'], bbox: [[32, 10], [60, 30.5]], at: [45, 23] },
    balkans: { label: { tr: 'Balkanlar', en: 'Balkans' }, def: { tr: 'Batı Balkanlar, Bulgaristan, Romanya.', en: 'Western Balkans, Bulgaria, Romania.' }, countries: ['BGR', 'ROU', 'SRB', 'BIH', 'MNE', 'MKD', 'ALB', 'XKX', 'HRV', 'SVN'], bbox: [[13.4, 39.6], [29.8, 48.3]], at: [21.6, 44] },
    'central-asia': { label: { tr: 'Orta Asya', en: 'Central Asia' }, def: { tr: 'Türk devletleri ve Orta Asya.', en: 'Turkic states and Central Asia.' }, countries: ['KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], bbox: [[46.5, 35], [87, 55.5]], at: [62, 42] },
    global: { label: { tr: 'Küresel', en: 'Global' }, def: { tr: 'Bölgeye bağlı olmayan: tedarik, küresel güçler, siber.', en: 'Not tied to one region: procurement, great powers, cyber.' }, countries: [], bbox: [[12, 20], [62, 50]], at: null },
  };
  GT.REGIONS = REGIONS;
  GT.REGION_CODES = Object.keys(REGIONS);
  GT.REGION_OF = {};
  for (const [code, r] of Object.entries(REGIONS)) for (const a of r.countries) GT.REGION_OF[a] = code;

  GT.SEAS = [
    { at: [24.9, 36.3], tr: 'Ege Denizi', en: 'Aegean Sea', size: 1 },
    { at: [28.6, 33.9], tr: 'Akdeniz', en: 'Mediterranean', size: 1.1 },
    { at: [34.6, 43.25], tr: 'Karadeniz', en: 'Black Sea', size: 1.15 },
    { at: [50.6, 41.8], tr: 'Hazar', en: 'Caspian', size: .9 },
    { at: [50.8, 27.4], tr: 'Basra Körfezi', en: 'Persian Gulf', size: .8 },
    { at: [37.4, 22.3], tr: 'Kızıldeniz', en: 'Red Sea', size: .8 },
  ];
  GT.COUNTRY_LABELS = {
    GRC: [21.9, 39.6], BGR: [25.3, 42.75], SYR: [38.4, 35.3], IRQ: [43.6, 33.3], IRN: [54, 32.8], GEO: [43.6, 42.15], ARM: [44.9, 40.25], AZE: [47.9, 40.45],
    UKR: [31.5, 48.8], RUS: [42.5, 49.3], EGY: [29.8, 26.5], LBY: [18, 27.8], JOR: [36.8, 30.7], SAU: [44.5, 24.8], ROU: [24.8, 45.9], SRB: [20.9, 44.1],
    ISR: [34.85, 30.7], LBN: [35.9, 33.9], CYP: [32.9, 34.82], XNC: [33.62, 35.28], TKM: [58.5, 39.2], KAZ: [66, 48], UZB: [63.5, 41.8], ALB: [20, 41],
    MKD: [21.7, 41.6], ITA: [14.5, 41.8], TUN: [9.5, 34], DZA: [3, 29], SDN: [30, 16], YEM: [47.5, 15.8], OMN: [56.5, 20.8], KWT: [47.7, 29.3],
    PAK: [69.6, 29.6], PSE: [35.3, 31.95],
  };
  // extra place labels (shown when zoomed in on the dashboard)
  GT.PLACE_LABELS = [
    { at: [34.38, 31.42], tr: 'Gazze', en: 'Gaza' },
    { at: [35.8, 33.05], tr: 'Golan', en: 'Golan' },
  ];
  Object.assign(I18N.tr, { 'lg.occupied': 'İşgal altındaki topraklar (Filistin, Golan, Kırım)', 'lg.concern': 'Doğu Türkistan · Uygur Türklerine yönelik ihlaller' });
  Object.assign(I18N.en, { 'lg.occupied': 'Occupied territory (Palestine, Golan, Crimea)', 'lg.concern': 'East Turkestan · abuses against Uyghur Turks' });

  /* Türkiye's defence agreements shown on the map. Every entry carries its sources so the layer stays auditable;
     add a country only with a signed agreement and a primary or reputable source.
     tier "ally" = mutual defence commitment, "coop" = defence / military cooperation agreement. */
  GT.AGREEMENTS = {
    mecca: {
      tr: 'Mekke Ortak Savunma Anlaşması · 7 Ağu 2026 (imzalandı; TBMM onayı bekleniyor)',
      en: 'Mecca Joint Defence Agreement · 7 Aug 2026 (signed; awaiting approval by the Turkish parliament)',
      sources: ['https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-suudi-arabistan-ve-pakistan-arasinda-ortak-savunma-anlasmasi-imzalandi',
        'https://www.aa.com.tr/tr/gundem/turkiye-suudi-arabistan-ve-pakistan-ortak-savunma-anlasmasi-imzaladi/4021014',
        'https://ankahaber.net/haber/tbmm-genel-kurulu-nun-gundemi-mekke-anlasmasi-oldu-ak-partili-zengin-anlasma-meclisimizde-onaylandiktan-sonra-yururluge-girmis-olacak-3420c0d2'],
    },
    'syr-2025': {
      tr: 'Ortak Eğitim ve Danışmanlık Mutabakat Muhtırası · 13 Ağu 2025', en: 'Joint Training and Advisory Memorandum of Understanding · 13 Aug 2025',
      sources: ['https://www.aa.com.tr/tr/gundem/msb-suriyenin-siyasi-birligini-toprak-butunlugunu-savunuyoruz/3659254',
        'https://english.aawsat.com/arab-world/5175423-t%C3%BCrkiye-equip-train-syrian-army-under-new-defense-pact'],
    },
    'egy-2026': {
      tr: 'Askerî Çerçeve Anlaşması · 4 Şub 2026 (+ savunma ve savunma sanayii iş birliği niyet mektupları · 13–14 Tem 2026)',
      en: 'Military Framework Agreement · 4 Feb 2026 (+ defence and defence-industry cooperation letters of intent · 13–14 Jul 2026)',
      sources: ['https://www.aa.com.tr/tr/gundem/turkiye-ile-misir-arasinda-anlasmalar-imzalandi/3820240',
        'https://www.al-monitor.com/originals/2026/07/turkey-egypt-expand-military-ties-cooperation-frameworks-what-know'],
    },
    shusha: {
      tr: 'Şuşa Beyannamesi (müttefiklik, karşılıklı yardım) · 15 Haz 2021 · yürürlükte (7355 sayılı Kanun) · + Karşılıklı Askerî Güvenliğin Güçlendirilmesine İlişkin Mutabakat Muhtırası · 22 Tem 2025',
      en: 'Shusha Declaration (alliance and mutual assistance) · 15 Jun 2021 · in force (Law 7355) · + MoU on Strengthening Mutual Military Security · 22 Jul 2025',
      sources: ['https://www.resmigazete.gov.tr/eskiler/2022/03/20220323-1.pdf',
        'https://www.aa.com.tr/tr/gundem/susa-beyannamesi-ve-milletlerarasi-anlasmalar-resmi-gazetede-yayimlandi/2501946',
        'https://www.aa.com.tr/tr/gundem/turkiye-ile-azerbaycan-karsilikli-askeri-guvenligin-guclendirilmesine-iliskin-mutabakat-muhtirasi-imzaladi/3638732',
        'https://avim.org.tr/tr/Bulten/ISTE-SUSA-BEYANNAMESI-NIN-TAM-METNI'],
    },
    guarantee: {
      tr: 'Garanti ve İttifak Antlaşmaları · 1959/60 (garantör devlet)', en: 'Treaties of Guarantee and Alliance · 1959/60 (guarantor power)',
      sources: ['https://www.mfa.gov.tr/garanti-antlasmasi-_zurich_11-subat-1959_.tr.mfa'],
    },
    'qat-2014': {
      tr: 'Askerî eğitim, savunma sanayii ve TSK konuşlanması işbirliği anlaşması · 19 Ara 2014 · yürürlükte (6633 sayılı Kanun; uygulama anlaşması 7023 sayılı Kanun)',
      en: 'Cooperation agreement on military training, defence industry & stationing of Turkish forces · 19 Dec 2014 · in force (Law 6633; implementing agreement Law 7023)',
      sources: ['https://www5.tbmm.gov.tr/tutanaklar/KANUNLAR_KARARLAR/kanuntbmmc099/kanuntbmmc099/kanuntbmmc09906633.pdf',
        'https://www5.tbmm.gov.tr/tutanaklar/KANUNLAR_KARARLAR/kanuntbmmc101/kanuntbmmc101/kanuntbmmc10107023.pdf',
        'https://www.aa.com.tr/tr/gunun-basliklari/katara-turk-askeri-konuslandirilmasi-karari-resmi-gazetede/837770'],
    },
    'lby-2019': {
      tr: 'Güvenlik ve askerî işbirliği mutabakatı (Trablus hükümeti) · 27 Kas 2019', en: 'Security & military cooperation MoU (Tripoli government) · 27 Nov 2019',
      sources: ['https://www.aa.com.tr/tr/libya/turkiye-libya-guvenlik-ve-askeri-is-birligi-mutabakat-muhtirasi-resmi-gazetede/1684355'],
    },
    'som-2024': {
      tr: 'Savunma ve Ekonomik İşbirliği Çerçeve Anlaşması · 8 Şub 2024', en: 'Defence & Economic Cooperation Framework Agreement · 8 Feb 2024',
      sources: ['https://www.aa.com.tr/tr/gundem/turkiye-ile-somali-arasinda-savunma-ve-ekonomik-isbirligi-cerceve-anlasmasi-/3131682',
        'https://www.aa.com.tr/tr/dunya/somali-turkiye-ile-imzaladigi-savunma-isbirligi-anlasmasini-onayladi/3143647'],
    },
    'irq-2024': {
      tr: 'Askerî eğitim iş birliği mutabakatı · 22 Nis 2024 · askerî, güvenlik işbirliği ve terörle mücadele mutabakatı · 15 Ağu 2024',
      en: 'Military training cooperation MoU · 22 Apr 2024 · military & security cooperation and counter-terrorism MoU · 15 Aug 2024',
      sources: ['https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-ile-irak-arasinda-26-anlasma-imzalandi',
        'https://www.iletisim.gov.tr/turkce/dis_basinda_turkiye/detay/turkiye-ve-irak-guvenlik-is-birligi-ve-terorle-mucadeleye-dair-mutabakat-zapti-imzaladi',
        'https://tr.euronews.com/2024/08/15/turkiye-ve-irak-arasinda-tarihi-askeri-mutabakat-zapti-imzalandi'],
    },
    'idn-2022': {
      tr: 'Savunma Alanında İşbirliğine İlişkin Anlaşma · 14 Kas 2022 · Savunma Sanayii İşbirliği Anlaşması · 12 Şub 2025 · 48 KAAN sözleşmesi · 26 Tem 2025',
      en: 'Agreement on Cooperation in the Field of Defence · 14 Nov 2022 · Defence Industry Cooperation Agreement · 12 Feb 2025 · contract for 48 KAAN jets · 26 Jul 2025',
      sources: ['https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-ile-endonezya-arasinda-13-anlasma-imzalandi',
        'https://cdn.tbmm.gov.tr/KKBSPublicFile/D27/Y6/T2/WebOnergeMetni/c2ff1932-2b7f-468c-b365-b8392e5de0ca.pdf',
        'https://www.iletisim.gov.tr/turkce/haberler/detay/cumhurbaskani-erdogan-cumhuriyet-tarihimizin-en-buyuk-savunma-ve-havacilik-ihracati-sozlesmesine-imza-atildi'],
    },
    'ken-2026': {
      tr: 'Savunma İş Birliği Anlaşması · Mayıs 2026 (SAHA 2026, İstanbul)', en: 'Defence Cooperation Agreement · May 2026 (SAHA 2026, Istanbul)',
      sources: ['https://www.mod.go.ke/news/strengthening-strategic-defence-partnerships-through-international-cooperation/',
        'https://en.yenisafak.com/turkiye/turkiye-kenya-sign-defense-cooperation-agreement-at-saha-2026-in-istanbul-3717928'],
    },
    'nga-2026': {
      tr: 'Askerî İş Birliği Protokolü · 27 Oca 2026 (+ Savunma Sanayi İş Birliği Anlaşması, TBMM onay sürecinde)',
      en: 'Military Cooperation Protocol · 27 Jan 2026 (+ Defence Industry Cooperation Agreement, pending approval by the Turkish parliament)',
      sources: ['https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-ile-nijerya-arasinda-9-anlasma-imzalandi-27-01-26',
        'https://fmino.gov.ng/nigeria-and-turkiye-forge-strategic-defence-partnership-at-antalya-diplomacy-forum-2026/'],
    },
    'ner-2020': {
      tr: 'Askerî Eğitim İşbirliği Anlaşması · Tem 2020 · Askerî Mali İşbirliği Anlaşması · 24 Tem 2025',
      en: 'Military Training Cooperation Agreement · Jul 2020 · Military Financial Cooperation Agreement · 24 Jul 2025',
      sources: ['https://www.aa.com.tr/tr/gundem/turkiye-ile-nijer-arasinda-askeri-mali-isbirligi-anlasmasi/3640633'],
    },
    'eth-2021': {
      tr: 'Askerî Çerçeve Anlaşması · 18 Ağu 2021 · yürürlükte (7453 sayılı Kanun, RG 10 Nis 2023) · + Askerî Mali İşbirliği Anlaşması · 2021',
      en: 'Military Framework Agreement · 18 Aug 2021 · in force (Law 7453, Official Gazette 10 Apr 2023) · + Military Financial Cooperation Agreement · 2021',
      sources: ['https://www.mevzuat.gov.tr/MevzuatMetin/1.5.7453.pdf',
        'https://www.lexpera.com.tr/resmi-gazete/metin/7453-turkiye-cumhuriyeti-hukumeti-ile-etiyopya-federal-demokratik-cumhuriyeti-hukumeti-arasinda'],
    },
    'dji-2024': {
      tr: 'Askerî Eğitim İş Birliği ve Askerî Mali İş Birliği Anlaşmaları · 19 Şub 2024 · + Askerî Alanda Eğitim, Teknik ve Bilimsel İşbirliği Anlaşması · 24 Oca 2015 (6854 sayılı Kanun)',
      en: 'Military Training Cooperation & Military Financial Cooperation Agreements · 19 Feb 2024 · + Agreement on Training, Technical and Scientific Cooperation in the Military Field · 24 Jan 2015 (Law 6854)',
      sources: ['https://www5.tbmm.gov.tr/tutanaklar/KANUNLAR_KARARLAR/kanuntbmmc101/kanuntbmmc101/kanuntbmmc10106854.pdf',
        'https://defensehere.com/tr/turkiye-ile-cibuti-arasinda-askeri-egitim-is-birligi-anlasmasi-imzalandi/'],
    },
    'omn-2025': {
      tr: 'Askerî İş Birliği Mutabakat Muhtırası ve Savunma Sanayii İş Birliği Mutabakat Zaptı · 23 Eki 2025',
      en: 'Military Cooperation MoU and Defence Industry Cooperation MoU · 23 Oct 2025',
      sources: ['https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-ile-umman-arasinda-16-anlasma-imzalandi',
        'https://www.aa.com.tr/tr/gundem/turkiye-ile-umman-arasinda-anlasmalar-imzalandi/3724674'],
    },
    'ukr-2020': {
      tr: 'Askerî Çerçeve Anlaşması · 16 Eki 2020', en: 'Military Framework Agreement · 16 Oct 2020',
      sources: ['https://www.haberturk.com/msb-acikladi-turkiye-ile-ukrayna-arasinda-askeri-cerceve-anlasmasi-imzalandi-2838381'],
    },
    'geo-2019': {
      tr: 'Askerî Mali İşbirliği Anlaşması · 24 Ara 2019 · + Askerî Sağlık Alanında Eğitim ve İşbirliği Protokolü · 9 Eki 2025',
      en: 'Military Financial Cooperation Agreement · 24 Dec 2019 · + Protocol on Training and Cooperation in Military Healthcare · 9 Oct 2025',
      sources: ['https://www.parliament.ge/en/media/news/safinanso-sabiujeto-komitetma-sakartvelos-mtavrobasa-da-turketis-respublikis-mtavrobas-shoris-samkhedro-jandatsvis-sferoshi-stsavlebisa-da-tanamshromlobis-shesakheb-okmi-ganikhila',
        'https://www.azernews.az/region/160078.html'],
    },
    'xkx-2024': {
      tr: 'Askerî Çerçeve Anlaşması · 29 Oca 2024 (TBMM onay sürecinde)', en: 'Military Framework Agreement · 29 Jan 2024 (pending approval by the Turkish parliament)',
      sources: ['https://tbmm.gov.tr/Gundem/GelenKagitDetay/ffbccb85-7d98-4d6a-9597-019584622dd8',
        'https://defensehere.com/tr/turkiye-ile-kosova-arasinda-askeri-cerceve-anlasmasi-imzalandi/'],
    },
    'bih-2021': {
      tr: 'Askerî Mali İşbirliği Anlaşması ve Nakdî Yardım Uygulama Protokolü · 3 Mar 2021',
      en: 'Military Financial Cooperation Agreement and Cash Assistance Implementation Protocol · 3 Mar 2021',
      sources: ['https://www.trthaber.com/haber/gundem/turkiye-bosna-hersek-arasinda-askeri-mali-isbirligi-anlasmasi-561303.html',
        'https://www.aa.com.tr/tr/dunya/bosna-hersek-savunma-bakani-helez-turkiye-ile-savunma-isbirligini-aaya-degerlendirdi/3435611'],
    },
    // tier "frame": signed military framework / defence-industry agreements, many still awaiting TBMM approval
    'kwt-2017': {
      tr: 'Savunma Sanayi İşbirliği Mutabakat Muhtırası (6781 sayılı Kanun) · + 2019 ortak savunma işbirliği planı · 11 Eki 2018',
      en: 'Defence Industry Cooperation MoU (Law 6781) · + joint defence cooperation plan for 2019 · 11 Oct 2018',
      sources: ['https://www.aa.com.tr/tr/turkiye/turkiye-ve-kuveyt-arasinda-askeri-is-birligi/1278848'],
    },
    'are-2011': {
      tr: 'Savunma Sanayi İş Birliği Mutabakat Muhtırası · 6 Eki 2011 · yürürlükte (6992 sayılı Kanun, RG 3 Nis 2017)',
      en: 'Defence Industry Cooperation MoU · 6 Oct 2011 · in force (Law 6992, Official Gazette 3 Apr 2017)',
      sources: ['https://www.lexpera.com.tr/resmi-gazete/metin/RG801Y2017N30027K6992',
        'https://www.iletisim.gov.tr/turkce/haberler/detay/turkiye-ile-birlesik-arap-emirlikleri-arasinda-13-anlasma-imzalandi'],
    },
    'bra-2022': {
      tr: 'Savunma Sanayii İş Birliği Anlaşması · 25 Mar 2022 · onaylandı (7586 sayılı Kanun, RG 4 Tem 2026; 11799 sayılı Cumhurbaşkanı Kararı, RG 18 Eyl 2026)',
      en: 'Defence Industry Cooperation Agreement · 25 Mar 2022 · ratified (Law 7586, Official Gazette 4 Jul 2026; Presidential Decision 11799, Official Gazette 18 Sep 2026)',
      sources: ['https://www.resmigazete.gov.tr/04.07.2026',
        'https://www.resmigazete.gov.tr/18.09.2026',
        'https://www.ahaber.com.tr/gundem/2026/07/04/turkiye-ve-brezilyadan-kritik-anlasma-savunmada-stratejik-is-birligi'],
    },
    'col-2026': {
      tr: 'Savunma sanayii işbirliği anlaşması · Şub 2015 · + SSB–Kolombiya Savunma Bakanlığı mutabakat muhtırası · 21 Oca 2026',
      en: 'Defence industry cooperation agreement · Feb 2015 · + SSB–Colombian Ministry of Defence MoU · 21 Jan 2026',
      sources: ['https://www.infodefensa.com/texto-diario/mostrar/5741338/016-colombia-colombia-turquia-firman-acuerdo-entendimiento-defensa',
        'https://www.defensa.com/colombia/colombia-turquia-firman-acuerdo-cooperacion-defensa'],
    },
    'mys-2025': {
      tr: 'SSB–Malezya savunma sanayii işbirliği anlaşmaları · Şub ve Tem 2025 (IDEF 2025)', en: 'SSB–Malaysia defence-industry cooperation agreements · Feb & Jul 2025 (IDEF 2025)',
      sources: ['https://www.tskgv.org.tr/savunma-sanayii-gundem/idef-2025te-turkiye-ve-malezya-arasinda-stratejik-is-birligi-anlasmalari-imzalandi',
        'https://www.malaymail.com/news/malaysia/2025/07/24/malaysia-eyes-defence-tech-transfer-from-turkiye-by-year-end-says-minister/184986'],
    },
    'tcd-2019': {
      tr: 'Askerî İşbirliği Çerçeve Anlaşması · 2019', en: 'Military Cooperation Framework Agreement · 2019',
      sources: ['https://www.msb.gov.tr/SlaytHaber/2722019-65641'],
    },
    'tbmm-mil-frame': {
      tr: 'Askerî Çerçeve / Askerî İş Birliği Çerçeve Anlaşması (imzalı; TBMM onay sürecinde)',
      en: 'Military Framework / Military Cooperation Framework Agreement (signed; pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    'tbmm-ind': {
      tr: 'Savunma Sanayii İş Birliği Anlaşması (imzalı; TBMM onay sürecinde)', en: 'Defence Industry Cooperation Agreement (signed; pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    'tbmm-edu': {
      tr: 'Askerî Eğitim İş Birliği (Tamamlayıcı) Anlaşması (imzalı; TBMM onay sürecinde)',
      en: 'Military Training Cooperation (Supplementary) Agreement (signed; pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    'tbmm-sec': {
      tr: 'Güvenlik İşbirliği Anlaşması (imzalı; TBMM onay sürecinde)', en: 'Security Cooperation Agreement (signed; pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    // NATO (drawn as its own light-blue layer, see GT.NATO) and allies' extra bilateral documents
    nato: {
      tr: "NATO müttefiki · Kuzey Atlantik Antlaşması md. 5 (md. 6 Türkiye topraklarını açıkça kapsar) · Türkiye 1952'den beri üye",
      en: 'NATO ally · North Atlantic Treaty Art. 5 (Art. 6 explicitly covers the territory of Turkey) · Türkiye a member since 1952',
      sources: ['https://www.nato.int/cps/en/natohq/official_texts_17120.htm'],
    },
    'gbr-2026': {
      tr: 'Güvenlik ve Savunma Ortaklığı Belgesi · 8 Tem 2026 · + 20 Eurofighter Typhoon anlaşması · 27 Eki 2025',
      en: 'Security and Defence Partnership · 8 Jul 2026 · + agreement for 20 Eurofighter Typhoons · 27 Oct 2025',
      sources: ['https://www.gov.uk/government/news/joint-statement-regarding-the-security-and-defence-partnership-between-the-united-kingdom-of-great-britain-and-northern-ireland-and-the-republic-of-tu',
        'https://www.iletisim.gov.tr/turkce/haberler/detay/cumhurbaskani-erdoganin-ingiltere-basbakani-starmer-ile-gorusmesine-iliskin-aciklama-08-07-26'],
    },
    'esp-hurjet': {
      tr: "HÜRJET (ITS-C) programı: sözleşme 29 Ara 2025, imza töreni 28 Nis 2026 · İncirlik'te İspanyol Patriot bataryası (NATO, 2015'ten beri) · savunma sanayiinde gizlilik dereceli bilgilerin korunması anlaşması (yürürlükte, 2018)",
      en: 'HÜRJET (ITS-C) programme: contract 29 Dec 2025, signing ceremony 28 Apr 2026 · Spanish Patriot battery at İncirlik (NATO, since 2015) · defence-industry classified-information agreement (in force, 2018)',
      sources: ['https://www.trthaber.com/haber/gundem/ssb-baskani-gorgun-hurjet-anlasmasini-bugun-itibariyla-butun-dunyaya-duyuruyoruz-943289.html',
        'https://emad.defensa.gob.es/en/operaciones/operaciones-en-el-exterior/36_Persistent_Effort/36.5_Support_to_Turkiye/index.html_2063069299.html',
        'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2018-3856'],
    },
    'pol-2025': {
      tr: 'Savunma Alanında İş Birliği Anlaşması · 15 Ara 2025', en: 'Agreement on Cooperation in the Field of Defence · 15 Dec 2025',
      sources: ['https://www.dunya.com/gundem/turkiye-ile-polonya-arasinda-savunma-is-birligi-anlasmasi-imzalandi-haberi-807488'],
    },
    'hun-2022': {
      tr: 'Askerî Çerçeve Anlaşması · 24 Eki 2022 (TBMM onay sürecinde) · + ulusal güvenlik ve savunma sanayii çerçeve anlaşmaları · 8 Ara 2025',
      en: 'Military Framework Agreement · 24 Oct 2022 (pending approval by the Turkish parliament) · + national-security and defence-industry framework agreements · 8 Dec 2025',
      sources: ['https://www.hurriyet.com.tr/dunya/turkiye-ve-macaristan-arasinda-askeri-cerceve-anlasmasi-imzalandi-42158681',
        'https://www.aa.com.tr/tr/politika/turkiye-ile-macaristan-arasinda-16-anlasma-imzalandi/3765566'],
    },
    'rou-2023': {
      tr: 'Askerî Çerçeve Anlaşması · 6 Eki 2023 (TBMM onay sürecinde)', en: 'Military Framework Agreement · 6 Oct 2023 (pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    'mkd-2024': {
      tr: 'Askerî Çerçeve Anlaşması · 23 Eki 2024 (TBMM onay sürecinde)', en: 'Military Framework Agreement · 23 Oct 2024 (pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    'alb-mil': {
      tr: 'Askerî Çerçeve Anlaşması (TBMM onay sürecinde)', en: 'Military Framework Agreement (pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    'prt-mil': {
      tr: 'Askerî Alanda İş Birliği Çerçeve Anlaşması (TBMM onay sürecinde)', en: 'Framework Agreement on Cooperation in the Military Field (pending approval by the Turkish parliament)',
      sources: ['https://www.tbmm.gov.tr/Gundem/GenelKurulGundemi'],
    },
    ots: {
      tr: 'Türk Devletleri Teşkilatı', en: 'Organization of Turkic States',
      sources: ['https://turkicstates.org/tr/turk-konseyi-hakkinda', 'https://turkicstates.org/tr/gozlemci-ulkeler'],
    },
  };
  // kin = Organization of Turkic States member/observer; presence = officially acknowledged permanent Turkish military
  // presence, shown at COUNTRY level only (red line: never positions or movements).
  GT.PARTNERS = {
    SAU: { tier: 'ally', agreement: 'mecca' },
    PAK: { tier: 'ally', agreement: 'mecca' },
    AZE: { tier: 'ally', agreement: 'shusha', kin: true },
    XNC: { tier: 'ally', agreement: 'guarantee', kin: true, observer: true, presence: true },
    SYR: { tier: 'coop', agreement: 'syr-2025' },
    EGY: { tier: 'coop', agreement: 'egy-2026' },
    QAT: { tier: 'coop', agreement: 'qat-2014', presence: true },
    LBY: { tier: 'coop', agreement: 'lby-2019', presence: true },
    SOM: { tier: 'coop', agreement: 'som-2024', presence: true },
    IRQ: { tier: 'coop', agreement: 'irq-2024' },
    IDN: { tier: 'coop', agreement: 'idn-2022' },
    KEN: { tier: 'coop', agreement: 'ken-2026' },
    NGA: { tier: 'coop', agreement: 'nga-2026' },
    NER: { tier: 'coop', agreement: 'ner-2020' },
    ETH: { tier: 'coop', agreement: 'eth-2021' },
    DJI: { tier: 'coop', agreement: 'dji-2024' },
    OMN: { tier: 'coop', agreement: 'omn-2025' },
    UKR: { tier: 'coop', agreement: 'ukr-2020' },
    GEO: { tier: 'coop', agreement: 'geo-2019' },
    XKX: { tier: 'coop', agreement: 'xkx-2024' },
    BIH: { tier: 'coop', agreement: 'bih-2021' },
    KWT: { tier: 'frame', agreement: 'kwt-2017' },
    ARE: { tier: 'frame', agreement: 'are-2011' },
    BRA: { tier: 'frame', agreement: 'bra-2022' },
    COL: { tier: 'frame', agreement: 'col-2026' },
    MYS: { tier: 'frame', agreement: 'mys-2025' },
    TCD: { tier: 'frame', agreement: 'tcd-2019' },
    SEN: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    TGO: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    GMB: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    SLE: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    MOZ: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    AGO: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    COD: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    ZWE: { tier: 'frame', agreement: 'tbmm-mil-frame' },
    UGA: { tier: 'frame', agreement: 'tbmm-ind' },
    TZA: { tier: 'frame', agreement: 'tbmm-ind' },
    GNQ: { tier: 'frame', agreement: 'tbmm-ind' },
    BFA: { tier: 'frame', agreement: 'tbmm-ind' },
    MDA: { tier: 'frame', agreement: 'tbmm-edu' },
    MLI: { tier: 'frame', agreement: 'tbmm-sec' },
    KAZ: { tier: 'kin', agreement: 'ots' },
    KGZ: { tier: 'kin', agreement: 'ots' },
    UZB: { tier: 'kin', agreement: 'ots' },
    TKM: { tier: 'kin', agreement: 'ots', observer: true },
    HUN: { tier: 'kin', agreement: 'ots', observer: true },
  };
  GT.PRESENCE_SOURCES = {
    QAT: ['https://www5.tbmm.gov.tr/tutanaklar/KANUNLAR_KARARLAR/kanuntbmmc101/kanuntbmmc101/kanuntbmmc10107023.pdf',
      'https://www.aa.com.tr/tr/gunun-basliklari/katara-turk-askeri-konuslandirilmasi-karari-resmi-gazetede/837770'],
    SOM: ['https://www.tbmm.gov.tr/Haber/Detay?Id=52226928-c750-4ae0-84bf-019f6f6e4618',
      'https://www.aa.com.tr/tr/politika/turk-silahli-kuvvetlerine-somalide-yeni-gorev/3280005'],
    LBY: ['https://www.aa.com.tr/tr/gundem/turk-askerinin-libyadaki-gorev-suresi-uzatildi/3777943'],
    XNC: ['https://www.mfa.gov.tr/garanti-antlasmasi-_zurich_11-subat-1959_.tr.mfa'],
  };
  // NATO allies (Art. 5 covers Türkiye): a light-blue layer on top of any bilateral tier. Greece is included
  // like every ally, with a note on the open disputes.
  GT.NATO = new Set(['ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU',
    'LUX', 'MNE', 'NLD', 'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'GBR', 'USA']);
  const NATO_PLUS = { GBR: 'gbr-2026', ESP: 'esp-hurjet', POL: 'pol-2025', HUN: 'hun-2022', ROU: 'rou-2023', MKD: 'mkd-2024', ALB: 'alb-mil', PRT: 'prt-mil' };
  const NATO_NOTES = {
    GRC: { tr: 'Ege, Doğu Akdeniz ve Kıbrıs konularında Türkiye ile ihtilaflar sürüyor.', en: 'Disputes with Türkiye over the Aegean, the Eastern Mediterranean and Cyprus continue.' },
  };
  GT.partnerClass = (a3) => {
    const p = GT.PARTNERS[a3];
    return (p ? ' m-' + p.tier + (p.presence ? ' m-presence' : '') : '') + (GT.NATO.has(a3) ? ' m-nato' : '');
  };
  GT.partnerLabel = (a3) => {
    const p = GT.PARTNERS[a3];
    const bits = [];
    if (p) {
      bits.push(GT.txt(GT.AGREEMENTS[p.agreement]));
      if (p.kin && p.agreement !== 'ots') bits.push(GT.txt(GT.AGREEMENTS.ots));
      if (p.observer) bits[bits.length - 1] += GT.lang === 'tr' ? ' (gözlemci)' : ' (observer)';
      if (p.presence) bits.push(GT.t('lg.presence'));
    }
    if (GT.NATO.has(a3)) {
      bits.push(GT.txt(GT.AGREEMENTS.nato));
      if (NATO_PLUS[a3]) bits.push(GT.txt(GT.AGREEMENTS[NATO_PLUS[a3]]));
      if (NATO_NOTES[a3]) bits.push(GT.txt(NATO_NOTES[a3]));
    }
    return bits.join(' · ');
  };
  Object.assign(I18N.tr, { 'lg.ally': 'Müttefik · karşılıklı savunma', 'lg.coop': 'Savunma işbirliği anlaşması', 'lg.kin': 'Türk Devletleri Teşkilatı', 'lg.presence': 'Resmî TSK varlığı (ülke düzeyi)' });
  Object.assign(I18N.en, { 'lg.ally': 'Ally · mutual defence', 'lg.coop': 'Defence cooperation agreement', 'lg.kin': 'Organization of Turkic States', 'lg.presence': 'Official Turkish military presence (country level)' });
  Object.assign(I18N.tr, {
    'lg.frame': 'Askerî çerçeve / savunma sanayii anlaşması (imzalı)', 'lg.nato': 'NATO müttefiki (md. 5)',
    'lg.ops': "Türkiye'nin ilan ettiği harekât bölgeleri (kesikli: sona erdi)",
    'ops.active': 'sürüyor', 'ops.ended': 'sona erdi', 'ops.unclear': 'durumu belirsiz', 'ops.asof': 'itibarıyla',
  });
  Object.assign(I18N.en, {
    'lg.frame': 'Military framework / defence-industry agreement (signed)', 'lg.nato': 'NATO ally (Art. 5)',
    'lg.ops': "Türkiye's announced operation areas (dashed: ended)",
    'ops.active': 'ongoing', 'ops.ended': 'ended', 'ops.unclear': 'status unclear', 'ops.asof': 'as of',
  });

  Object.assign(I18N.tr, {
    'p.lyr.activity': 'İlan edilen faaliyet', 'p.lyr.records': 'Kayıtlar', 'p.lyr.map': 'Harita',
    'p.key': 'Harita anahtarı', 'p.period': 'Dönem', 'p.days': 'Son {n} gün',
    'p.sum.window': 'Seçili dönem', 'p.sum.status': 'Doğrulama', 'p.sum.top': 'Öne çıkan bölge',
    'p.brief': 'Brifing', 'p.briefTitle': 'OSINT brifingi', 'p.briefFilters': 'Süzgeç', 'p.briefAt': 'Çıktı',
    'p.briefNote': 'Her kayıt kaynağıyla birlikte panelde',
    'p.allRegions': 'Tüm bölgeler', 'p.year': 'Son 12 ay',
    'p.sum.last': 'Son kayıt', 'p.sum.inDays': '{n} kayıt · son {d} gün', 'p.sum.all': '{n} kayıt · tüm dönem',
    'lg.activity': 'İlan edilen deniz faaliyeti (2015–2021, yabancı seyir ihbarları; Türk ihbarları sayılmaz)',
  });
  Object.assign(I18N.en, {
    'p.lyr.activity': 'Announced activity', 'p.lyr.records': 'Records', 'p.lyr.map': 'Map',
    'p.key': 'Map key', 'p.period': 'Period', 'p.days': 'Last {n} days',
    'p.sum.window': 'Selected period', 'p.sum.status': 'Verification', 'p.sum.top': 'Leading region',
    'p.brief': 'Brief', 'p.briefTitle': 'OSINT briefing', 'p.briefFilters': 'Filter', 'p.briefAt': 'Printed',
    'p.briefNote': 'Every record with its sources is in the panel',
    'p.allRegions': 'All regions', 'p.year': 'Last 12 months',
    'p.sum.last': 'Newest record', 'p.sum.inDays': '{n} records · last {d} days', 'p.sum.all': '{n} records · all time',
    'lg.activity': "Announced activity at sea (2015–2021, other states' navigational warnings; Turkish ones are not counted)",
  });
  Object.assign(I18N.tr, {
    'nav.trade': 'İsrail ticareti',
    't.mn': 'M$', 't.bn': 'milyar $',
    't.eyebrow': 'İsrail ticareti', 't.title1': 'Ticaret durduruldu.', 't.title2': 'İki defter ne diyor?',
    't.lead': 'Türkiye 2024’te İsrail ile ticaretin durdurulduğunu açıkladı. Bu sayfa o kararı yargılamaz: iki devletin kendi aylık beyanlarını yan yana koyar. Türkiye ihracatını varış ülkesine göre, İsrail ithalatını menşe ülkesine göre raporlar — üçüncü bir ülke üzerinden sevk edilen Türk menşeli bir mal, bir deftere girer, ötekine girmez.',
    't.not': 'Burada hiçbir gemi izlenmiyor. Sivil bir geminin konumu, rotası veya mürettebatı hiçbir biçimde yayımlanmaz: bu sularda ticaret gemilerine saldırılıyor ve konum, bir uyum kaydını hedef listesine çeviren tek alandır (ADR 0022).',
    't.seriesk': 'Aylık seri', 't.series': 'İki devletin kendi rakamları',
    't.serieslead': 'Kırmızı çizgi Türkiye’nin beyanı, mavi çizgi İsrail’inki. Yasaktan önce ikisi birbirini yüzde birkaç farkla takip eder.',
    't.loading': 'Yükleniyor…', 't.err': 'Seri yüklenemedi.',
    't.stat.total': 'Yasaktan sonra İsrail’in kaydettiği Türkiye menşeli ithalat',
    't.stat.totalTip': '{n} ayın toplamı', 't.stat.turLines': 'Türkiye’nin defterinde İsrail satırı olan ay',
    't.stat.before': 'Yasaktan önce aylık ortalama ihracat', 't.stat.sea': 'Yasaktan önce denizyolu payı',
    't.haltLabel': 'Yasak ilan edildi', 't.tip': '{m} · Türkiye: {tr} · İsrail: {il}', 't.noLine': 'satır yok',
    't.aria': '{a} – {b} arası aylık seri: Türkiye’nin beyan ettiği ihracat ve İsrail’in beyan ettiği ithalat.',
    't.note': 'Yasaktan sonraki {d} ayın {n} tanesinde İsrail, Türkiye menşeli ithalat kaydetti; toplamı {v}. Aynı aylarda Türkiye’nin beyanlarında İsrail satırı yok. Bu aylarda Türkiye başka ortaklarını raporladığı için bu bir “veri yok” değil, raporlanmış bir yokluktur.',
    't.src': 'Kaynak: UN Comtrade aylık mal ticareti; raportörler Türkiye ve İsrail. Son ay: {p}. Rakamlar ABD doları.',
    't.routesk': 'Komşu satırları', 't.routes': 'Hangi satır büyüdü?',
    't.routeslead': 'Türkiye’nin kendi ihracatı: yasaktan önceki 12 ayın ortalamasıyla sonraki 12 ayın ortalaması.',
    't.routesnote': 'Büyüyen bir satır rota değildir: hiçbir mal bir istatistikten ötekine izlenmez ve her ekonomi kendi nedenleriyle büyür. Bu karşılaştırmanın söyleyebileceği tek şey, bir sonraki bakışın nereye yöneleceği ve nereye yönelmeyeceğidir.',
    't.allExports': 'Aynı iki pencerede Türkiye’nin toplam ihracatı {pct}% değişti ({a}/ay → {b}/ay). Yani yukarıdaki hareketler genel büyümeyle açıklanmıyor.',
    't.r.partner': 'Ortak', 't.r.before': 'Önce (12 ay ort.)', 't.r.after': 'Sonra (12 ay ort.)', 't.r.change': 'Değişim',
    't.r.tip': 'Önce {b} ay, sonra {n} ay verisiyle',
    't.howk': 'Okuma kılavuzu', 't.how': 'Bu seri nasıl okunur',
    't.how1': 'İki rakam da resmîdir ve farklı şeyleri ölçer. Türkiye ihracatını varış ülkesine göre, İsrail ithalatını menşe ülkesine göre raporlar. Yasaktan önce iki çizgi birbirini yüzde birkaç farkla takip eder; serinin sonrasını okunabilir kılan da budur.',
    't.how2': 'Bir ayda Türkiye’nin beyanında İsrail satırının bulunmaması iki anlama gelebilirdi: ticaret yok ya da rapor yok. Her böyle ay, aynı ayın Almanya satırıyla denetlenir; Türkiye o ay başka ortakları raporlamışsa yokluk, raporlanmış bir yokluktur. Bu denetimi geçmeyen hiçbir ay “sıfıra indi” diye yayımlanmaz.',
    't.how3': 'Fark, bir kaçakçılık iddiası değildir. Üçüncü bir ülke üzerinden sevk edilen Türk menşeli mal, Türkiye’nin defterinde o ülkeye ihracat, İsrail’in defterinde Türk menşeli ithalat olarak görünür. Fark, yönlendirmenin ölçüsüdür; bir mekanizma iddiası varsa kaynağına atfedilir.',
    't.how4': 'Her sayı tek komutla yeniden üretilir: python tools/trade/build_trade.py --refresh. Veri dosyası yöntemini ve penceresini kendi içinde taşır.',
  });
  Object.assign(I18N.en, {
    'nav.trade': 'Trade with Israel',
    't.mn': 'M$', 't.bn': 'bn $',
    't.eyebrow': 'Trade with Israel', 't.title1': 'The trade was halted.', 't.title2': 'What do the two ledgers say?',
    't.lead': 'Türkiye announced in 2024 that trade with Israel had been halted. This page does not judge that decision: it puts the two states’ own monthly returns side by side. Türkiye reports exports by country of destination and Israel reports imports by country of origin — so a Turkish-made good shipped through a third country enters one ledger and not the other.',
    't.not': 'No vessel is tracked here. The position, route or crew of a civilian ship is never published: merchant ships in these waters are being attacked, and a position is the one field that turns a compliance record into a target list (ADR 0022).',
    't.seriesk': 'Monthly series', 't.series': 'Each state’s own figures',
    't.serieslead': 'The red line is what Türkiye reports, the blue line what Israel reports. Before the halt they track each other to within a few per cent.',
    't.loading': 'Loading…', 't.err': 'The series could not be loaded.',
    't.stat.total': 'Imports of Turkish origin recorded by Israel since the halt',
    't.stat.totalTip': 'total over {n} months', 't.stat.turLines': 'Months with an Israel line in Türkiye’s returns',
    't.stat.before': 'Monthly average exports before the halt', 't.stat.sea': 'Share carried by sea before the halt',
    't.haltLabel': 'Halt announced', 't.tip': '{m} · Türkiye: {tr} · Israel: {il}', 't.noLine': 'no line',
    't.aria': 'Monthly series from {a} to {b}: exports as Türkiye reports them and imports as Israel reports them.',
    't.note': 'In {n} of the {d} months since the halt Israel recorded imports of Turkish origin, {v} in total. In those same months Türkiye’s returns carry no Israel line at all. Because Türkiye reported other partners in those months, this is a reported absence rather than missing data.',
    't.src': 'Source: UN Comtrade monthly merchandise trade; reporters Türkiye and Israel. Latest month: {p}. Figures in US dollars.',
    't.routesk': 'The neighbours’ lines', 't.routes': 'Which line grew?',
    't.routeslead': 'Türkiye’s own exports: the average of the twelve months before the halt against the twelve after it.',
    't.routesnote': 'A line that grew is not a route: nothing is traced from one statistic to another, and every economy grows for its own reasons. All this comparison can say is where a check would look next, and where it would not.',
    't.allExports': 'Across the same two windows Türkiye’s exports as a whole changed by {pct}% ({a}/month → {b}/month), so the moves above are not the general trend.',
    't.r.partner': 'Partner', 't.r.before': 'Before (12-mo avg)', 't.r.after': 'After (12-mo avg)', 't.r.change': 'Change',
    't.r.tip': 'from {b} months before and {n} after',
    't.howk': 'How to read it', 't.how': 'How to read this series',
    't.how1': 'Both figures are official and they measure different things. Türkiye reports exports by country of destination; Israel reports imports by country of origin. Before the halt the two lines agree to within a few per cent, which is what makes the rest of the series readable.',
    't.how2': 'A month with no Israel line in Türkiye’s returns could mean no trade or no report. Every such month is checked against the same month’s Germany line: if Türkiye reported other partners, the absence is a reported one. No month is published as a fall to zero unless that check passed.',
    't.how3': 'The gap is not an accusation of smuggling. A Turkish-made good shipped through a third country is an export to that country in Türkiye’s books and an import of Turkish origin in Israel’s. The gap is a measurement of routing; any claim about mechanism is attributed to its source.',
    't.how4': 'Every figure is reproducible with one command: python tools/trade/build_trade.py --refresh. The data file carries its own method and window.',
  });

  Object.assign(I18N.tr, { 'lg.blue': "Mavi Vatan · deniz yetki alanları (Türkiye'nin tutumu)", 'lg.agreed': 'Anlaşmayla belirlenmiş', 'lg.position': "Türkiye'nin tutumu (itiraz edilen)", 'lg.island': 'Türk adası' });
  Object.assign(I18N.en, { 'lg.blue': "Blue Homeland · maritime jurisdiction (Türkiye's position)", 'lg.agreed': 'Delimited by agreement', 'lg.position': "Türkiye's position (disputed)", 'lg.island': 'Turkish island' });

  // d3-geo treats counter-clockwise rings (RFC 7946 order) as "everything but this": flip any polygon larger than a hemisphere.
  const rewind = (f) => {
    const g = f.geometry;
    if (g && /Polygon/.test(g.type) && d3.geoArea(f) > 2 * Math.PI) {
      const rev = (poly) => poly.map((ring) => ring.slice().reverse());
      g.coordinates = g.type === 'Polygon' ? rev(g.coordinates) : g.coordinates.map(rev);
    }
    return f;
  };
  // optional layers are the same for every detail level: fetch and prepare each one once per page
  const layerCache = new Map();
  const optionalLayer = (u) => {
    if (!layerCache.has(u)) {
      layerCache.set(u, (async () => {
        try { const r = await fetch(u); return r.ok ? (await r.json()).features.map(rewind) : []; } catch (e) { return []; }
      })());
    }
    return layerCache.get(u);
  };

  /* Cities for the zoomed-in map when no basemap is drawing them (assets/data/places-10m.geojson,
     built by tools/geo/build_places.py). Fetched the first time it is asked for and never again. */
  GT.loadPlaces = () => optionalLayer('assets/data/places-10m.geojson');

  Object.assign(I18N.tr, {
    'nav.register': 'Ege sicili',
    'r.eyebrow': 'Ege sicili', 'r.title1': 'Antlaşmayla silahsız adalarda', 'r.title2': 'bugün ne var?',
    'r.lead': "Lozan Barış Antlaşması (1923) ve Paris Barış Antlaşması (1947), Doğu Ege adaları ile Oniki Ada'yı askerden arındırılmış bir rejime bağlar. Bu sicil, o adalarda bugün ne olduğunu — hangi maddeye karşı, hangi kaynakla — kayıt kayıt tutar. Bir iddia listesi değil, bir uyum kaydıdır: yetenek ve duruş belgelenir, niyet iddiası kurulmaz.",
    'r.not': "Bu sayfada koordinat, harita işareti, personel bilgisi, güncel hareket ve zafiyet değerlendirmesi yoktur ve olmayacaktır. Koordinat, birincil kaynağıyla doğrulanmadan hiçbir kayda yazılmaz; bu yüzden sicilin ilk sürümü bilerek koordinatsızdır (ADR 0019).",
    'r.listk': 'Kayıtlar', 'r.list': 'Adalar',
    'r.listlead': "Her kayıt, veri setindeki dosyanın kendisidir; burada gördüğünüz metin kaydın içindeki metindir.",
    'r.loading': 'Yükleniyor…', 'r.count': '{n} kayıt', 'r.empty': 'Bu sicilde henüz kayıt yok.',
    'r.err': 'Veri yüklenemedi.', 'r.sources': 'Kaynaklar', 'r.decision': 'Karar',
    'r.actk': 'İlan edilen faaliyet', 'r.act': 'Denizde ne ilan ediliyor?',
    'r.actlead': 'Bir devletin seyre kapattığı alanlar, o devletin kendi yayımladığı bir faaliyet ölçüsüdür. Sütunlar, bölgemize ait seyir ihbarlarının o yılki arşivin tamamı içindeki payıdır (binde); kırmızı kısım, kelimeleri askerî faaliyet adlandıran ihbarların payını gösterir.',
    'r.breaknote': "Zirve {p} yılındadır: bölgenin payı binde {v}. {b} ve sonrası içi boş çizilir, çünkü NGA bu tarihten sonra NAVAREA III ve Yunan NAVTEX mesajlarını aktarmayı büyük ölçüde bıraktı — oradaki düşüş denizde olanın değil, arşivin taşıdığının değişimidir ve öyle okunmamalıdır. Türk makamlarının yayımladığı ihbarlar hiç sayılmaz.",
    'r.tip': '{y}: bölgede {n} ihbar ({m} askerî), arşivin o yılki toplamı {a}',
    'r.aria': '{a}–{b} arası yıllık ilan edilen deniz faaliyeti sütun grafiği ({n} yıl)',
    'r.built': '{k} ihbar sayıldı · {t} Türk ihbarı sayılmadı',
    'r.howk': 'Okuma kılavuzu', 'r.how': 'Bu sicil nasıl okunur',
    'r.how1': "Her kayıt üç şeyi ayırır: antlaşmanın ne dediği (metinden alıntıyla), bugün belgelenen şey ve eksik olan şey. Kaynak sırası da bunu izler: önce antlaşma metni, sonra resmî tutum, en sonda ikincil kaynaklar kendi güvenilirlik notlarıyla.",
    'r.how2': "OpenStreetMap sayıları ipucudur, bulgu değildir: gönüllülerin etiketlediği bir nesne bugün faal olduğunu kanıtlamaz ve İkinci Dünya Savaşı'ndan kalma bir mevzi de aynı etiketi taşır. Sorgu yalnızca Yunan toprağıyla sınırlıdır; Türk toprağındaki hiçbir nesne bu sayılara girmez.",
    'r.how3': "Bir kaydı yanlış bulursanız düzeltme açın: sicilin gücü, tek bir yanlış satırın bütün tabloyu çürütebileceğini bilerek yazılmış olmasıdır.",
  });
  Object.assign(I18N.en, {
    'nav.register': 'Aegean register',
    'r.eyebrow': 'Aegean register', 'r.title1': 'On islands demilitarised by treaty,', 'r.title2': 'what stands today?',
    'r.lead': 'The 1923 Treaty of Lausanne and the 1947 Treaty of Paris place the eastern Aegean islands and the Dodecanese under a demilitarised regime. This register keeps, record by record, what is on those islands today — against which article, on whose evidence. It is a compliance register, not a list of claims: it documents capability and posture, and makes no assertion about intent.',
    'r.not': 'There are no coordinates on this page, no map markers, no personnel, no current movements and no vulnerability assessment — and there will not be. A coordinate is written into a record once it has been verified against a primary source, so the first version of the register is deliberately without them (ADR 0019).',
    'r.listk': 'Records', 'r.list': 'The islands',
    'r.listlead': 'Each card is the record itself: the text you read here is the text inside the file.',
    'r.loading': 'Loading…', 'r.count': '{n} records', 'r.empty': 'No records in this register yet.',
    'r.err': 'Could not load the data.', 'r.sources': 'Sources', 'r.decision': 'Decision',
    'r.actk': 'Announced activity', 'r.act': 'What is being announced at sea?',
    'r.actlead': "The areas a state closes to navigation are a measure of its activity that the state publishes itself. Each bar is the region's share of the whole archive for that year (per 1,000); the red part is the share of warnings whose wording names military activity.",
    'r.breaknote': 'The peak is {p}, at {v} per 1,000. {b} onwards is drawn hollow because NGA largely stopped relaying NAVAREA III and the Greek NAVTEX stations after then — that fall is a change in what the archive carries, not in what happens at sea, and must not be read as one. Warnings issued by Turkish authorities are never counted.',
    'r.tip': '{y}: {n} warnings in the region ({m} military), {a} in the archive that year',
    'r.aria': 'Bar chart of announced activity at sea per year, {a}–{b} ({n} years)',
    'r.built': '{k} warnings counted · {t} Turkish warnings not counted',
    'r.howk': 'How to read it', 'r.how': 'How to read this register',
    'r.how1': 'Every record separates three things: what the treaty says (quoted from the text), what is documented today, and what is missing. The order of the sources follows the same rule — the treaty text first, then the official position, then secondary sources with their own reliability noted.',
    'r.how2': "The OpenStreetMap counts are leads, not findings: a volunteer's tag does not prove a facility is in use today, and a Second World War position carries the same tag. The query is restricted to Greek territory, so nothing on Turkish soil enters these numbers.",
    'r.how3': 'If a record is wrong, open a correction: the register is written in the knowledge that one wrong line can discredit the whole table.',
  });
  Object.assign(I18N.tr, { 'p.regional': 'bölge düzeyi, kesin konum yok', 'lg.regional': 'Olay (bölge düzeyi)' });
  Object.assign(I18N.en, { 'p.regional': 'region level only; no precise location', 'lg.regional': 'Event (region level)' });
  Object.assign(I18N.tr, { 'lg.mission': 'Türk dış temsilciliği (şehir düzeyi)', 'p.lyr.missions': 'Temsilcilikler','lg.schematic': "Şematik — Türkiye'nin tutumu esas alınarak çizildi, resmî koordinat değildir" });
  Object.assign(I18N.en, { 'lg.mission': 'Turkish diplomatic mission (city level)', 'p.lyr.missions': 'Missions', 'lg.schematic': "Schematic — based on Türkiye's position, not official coordinates" });
  Object.assign(I18N.tr, { 'lg.licence': 'KKTC ruhsat sahası (TPAO) · resmî koordinatlar, KKTC Resmî Gazete 161, 22.9.2011' });
  Object.assign(I18N.en, { 'lg.licence': 'TRNC licence area (TPAO) · official coordinates, TRNC Official Gazette 161, 22 Sep 2011' });
  Object.assign(I18N.tr, { 'lg.internal': 'Türk iç suları ve karasuları · Boğazlarda geçiş: Montrö Sözleşmesi (1936)' });
  Object.assign(I18N.en, { 'lg.internal': 'Turkish internal and territorial waters · passage through the Straits: Montreux Convention (1936)' });

  const NO_BORDER = new Set(['ISR-SYR']);
  GT.loadWorld = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('world: HTTP ' + r.status);
    const topo = await r.json();
    // Optional layers: areas per Türkiye's official position (Crimea → Ukraine, Golan → Syria),
    // Mavi Vatan maritime jurisdiction/claims and Turkish islands (see assets/data/MARITIME-SOURCES.md),
    // and Türkiye's diplomatic missions at city level (see assets/data/MISSIONS-SOURCES.md).
    const base = url.replace(/countries-\d+m\.json$/, '');
    const [disputed, maritime, islands, missions, concern, ops] = await Promise.all(
      ['disputed-tur-view', 'maritime-tur', 'islands-tur', 'missions-tur', 'concern-regions', 'tur-operation-areas'].map((n) => optionalLayer(base + n + '.geojson')));
    // a merged area (e.g. Türkiye + KKTC) replaces the schematic areas it lists in `components`;
    // licence blocks it lists stay, drawn as outlines inside it
    const merged = new Set(maritime.flatMap((m) => m.properties.components || []));
    return {
      maritime: maritime.filter((m) => !(merged.has(m.properties.id) && m.properties.status === 'schematic')),
      islands,
      missions,
      concern, // human-rights markers (East Turkestan) — not boundary claims
      ops, // Türkiye's officially announced operation areas: whole areas only, with status (ADR 0015)
      countries: topojson.feature(topo, topo.objects.countries).features,
      // no border line between features that map to the same state (e.g. Somaliland is part of Somalia)
      // nor between Syria and Israel: Natural Earth puts Golan inside Israel, so that line is the 1974
      // ceasefire line; per Türkiye Golan is Syrian (drawn with Syria, hatched as occupied)
      borders: topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && GT.a3(a) !== GT.a3(b)
        && !NO_BORDER.has([GT.a3(a), GT.a3(b)].sort().join('-'))),
      disputed,
    };
  };
  GT.a3 = (f) => (f.id ? NUM[f.id] : NAMELESS[f.properties.name]) || null;
  GT.countryName = (a3OrFeature) => {
    const a = typeof a3OrFeature === 'string' ? a3OrFeature : GT.a3(a3OrFeature);
    if (a && NAMES[a]) return NAMES[a][GT.lang === 'en' ? 1 : 0];
    if (a && GT.vocab && GT.vocab.countries) { const hit = GT.vocab.countries.find((c) => c.code === a); if (hit) return GT.txt(hit.label); }
    return typeof a3OrFeature === 'string' ? a3OrFeature : a3OrFeature.properties.name;
  };
  GT.fmtLL = ([lon, lat]) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;

  /* Draw a radar sweep made of thin slices with increasing opacity; rotated via SMIL so it works in any SVG transform context. */
  GT.sweep = (parent, radius, reduce, dur) => {
    const g = parent.append('g').attr('class', 'm-sweep');
    const inner = g.append('g');
    const n = 28, span = Math.PI / 3.2;
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    for (let i = 0; i < n; i++) {
      inner.append('path').attr('class', 'm-sweep-slice')
        .attr('d', arc({ startAngle: (i / n) * span, endAngle: ((i + 1) / n) * span + 0.002 }))
        .attr('fill', `rgba(200,0,42,${(0.16 * Math.pow((i + 1) / n, 2.2)).toFixed(4)})`);
    }
    inner.append('line').attr('class', 'm-sweep-edge').attr('x1', 0).attr('y1', 0)
      .attr('x2', radius * Math.sin(span)).attr('y2', -radius * Math.cos(span));
    if (!reduce) {
      inner.append('animateTransform').attr('attributeName', 'transform').attr('type', 'rotate')
        .attr('from', '0').attr('to', '360').attr('dur', (dur || 12) + 's').attr('repeatCount', 'indefinite');
    } else {
      inner.attr('transform', 'rotate(40)');
    }
    return g;
  };

  GT.mapDefs = (svg) => {
    const defs = svg.append('defs');
    const tg = defs.append('linearGradient').attr('id', 'trFill').attr('x1', 0).attr('y1', 0).attr('x2', 1).attr('y2', 1);
    tg.append('stop').attr('offset', '0%').attr('stop-color', '#3d000b');
    tg.append('stop').attr('offset', '55%').attr('stop-color', '#7a0016');
    tg.append('stop').attr('offset', '100%').attr('stop-color', '#99001c');
    const f = defs.append('filter').attr('id', 'glow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    f.append('feGaussianBlur').attr('stdDeviation', 7);
    // hatch for territory under occupation (Palestine, Golan, Crimea)
    const h = defs.append('pattern').attr('id', 'occHatch').attr('width', 6).attr('height', 6)
      .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)');
    // lines only (no background) so the de jure state's colour shows through
    h.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('stroke', 'rgba(232,227,220,0.4)').attr('stroke-width', 1.2);
    return defs;
  };
})();
