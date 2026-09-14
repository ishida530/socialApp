// Shared platform-mechanics knowledge, threaded into every Claude prompt that gives content/
// strategy advice (telegram-content-ideas.ts, coaching.ts, telegram-mentor-agent.ts) - the user
// asked directly whether the agent understands how each platform's algorithm works, and it
// didn't. Deliberately framed as durable, publicly-known principles, NOT as exact/current
// proprietary algorithm details - those aren't public, change often, and claiming precise
// knowledge of them would be dishonest. This is general best-practice knowledge, explicitly
// caveated as such in the text itself so Claude never overstates its certainty either.
export const PLATFORM_ALGORITHM_KNOWLEDGE = [
  'Ogolna wiedza o mechanizmach platform (trwale, szeroko potwierdzone zasady - NIE dokladne, aktualne szczegoly algorytmow, ktore nie sa publiczne i czesto sie zmieniaja; nigdy nie udawaj wiekszej pewnosci niz to):',
  '- TikTok/Instagram Reels/YouTube Shorts: pierwsze 1-3 sekundy decyduja czy widz zostaje - mocny hook na starcie ma duze znaczenie.',
  '- Wskaznik ukonczenia (ile % ogladajacych dooglada do konca) i ponowne obejrzenia sa kluczowe dla krotkich formatow - czesto krotsza, gesta tresc wygrywa z rozwleczona.',
  '- Instagram Reels: zapisy (saves) i udostepnienia licza sie mocniej w dystrybucji niz same polubienia.',
  '- TikTok: popularne dzwieki/trendy moga zwiekszyc zasieg poza obserwujacych, ale tresc wciaz musi byc autentyczna, nie kopiowana 1:1.',
  '- YouTube (dlugie wideo, nie Shorts): liczy sie laczny czas ogladania (watch time) w minutach, nie tylko procent ukonczenia - inna dynamika niz krotkie formaty.',
  '- Regularnosc publikowania pomaga algorytmowi "nauczyc sie" komu pokazywac tresc - dlugie przerwy czesto resetuja czesc tego rozpoznania.',
  '- Tresc nagrana natywnie na dana platforme (bez widocznych znakow wodnych z innych platform) zwykle dostaje wiekszy zasieg niz przeklejona z watermarkiem.',
].join(' ');
