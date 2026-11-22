# CS2 Lineupy

Strona do nauki lineupów granatów w CS2 dla Ciebie i znajomych. Działa jako statyczna strona na GitHub Pages.
Panel edycji jest w przeglądarce i zapisuje zmiany bezpośrednio do repozytorium, więc nie trzeba ruszać kodu.

## Struktura

```
index.html            – jedyna strona (routing po #, np. #/l/<id> to link do lineupu)
lineups.json          – CAŁA baza: mapy + lineupy
config.json           – repo, gałąź, zaszyfrowany token grupy
.nojekyll             – wyłącza Jekyll na GitHub Pages
images/<mapa>/        – zdjęcia lineupów (WebP), miniatury (_thumb-*) i radary (_radar-*)
assets/css/style.css
assets/js/app.js      – widoki przeglądania, radar, wyszukiwarka, ulubione
assets/js/admin.js    – panel: lineupy, mapy, ustawienia
assets/js/store.js    – wczytywanie danych, logowanie, zapis
assets/js/github.js   – GitHub API (jeden commit na zmianę) + szyfrowanie tokena
assets/js/images.js   – kompresja do WebP (max 1600 px), ZIP, IndexedDB
assets/js/ui.js       – stałe (granaty, typy rzutów), ikony, lightbox, toasty
```

## Wdrożenie (ok. 10 minut)

### 1. Repozytorium i GitHub Pages
1. Na GitHubie utwórz **publiczne** repozytorium, np. `cs2-lineupy`. Darmowe Pages działa tylko dla repo publicznych.
2. Wrzuć zawartość tego folderu do repo, tak żeby `index.html` leżał w głównym katalogu:
   - przez stronę: **Add file → Upload files**, przeciągnij wszystkie pliki i foldery, potem **Commit**,
   - albo przez git: `git init && git add . && git commit -m "start" && git branch -M main && git remote add origin https://github.com/TWOJ_LOGIN/cs2-lineupy.git && git push -u origin main`.
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)` → **Save**.
4. Po 1–2 minutach strona działa pod adresem `https://TWOJ_LOGIN.github.io/cs2-lineupy/`.

> Repozytorium wykrywa się automatycznie z adresu `*.github.io`. Jeśli używasz własnej domeny, wpisz je w `config.json`: `"repo": "TWOJ_LOGIN/cs2-lineupy"`.

### 2. Token do zapisu (robi to tylko właściciel repo, raz)
1. GitHub → avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: *Only select repositories* → wybierz tylko `cs2-lineupy`.
3. **Permissions → Repository permissions → Contents: Read and write**. Metadata ustawi się sam jako *Read*.
4. Ustaw datę ważności, np. na rok. Skopiuj token (`github_pat_…`).

### 3. Hasło grupy
1. Wejdź na stronę → ✎ (prawy górny róg) → wpisz nick → **Zaloguj własnym tokenem GitHub** → wklej token.
2. Zakładka **Ustawienia → Hasło grupy**: zostaw pole tokena puste (użyje bieżącego), wpisz hasło dwa razy i kliknij **Zaszyfruj i zapisz w repo**.
3. Po ok. minucie znajomi logują się **samym hasłem grupy** i swoim nickiem.

**Bezpieczeństwo:** zaszyfrowany token leży w publicznym `config.json`. Hasło musi być długie, np. 4–5 losowych słów, żeby nie dało się go zgadnąć. Token ma dostęp tylko do tego jednego repo, a każda zmiana jest commitem, więc w razie czego wszystko cofniesz w historii gita. Żeby kogoś odciąć: wygeneruj nowy token, usuń stary i ustaw nowe hasło.

## Codzienne użycie
- **Dodawanie lineupu:** ✎ → *+ Nowy lineup*. Zdjęcia możesz przeciągnąć, wybrać albo wkleić screenshot `Ctrl+V`. Kolejność ustawiasz przeciąganiem lub strzałkami ◀ ▶. Kolejność zdjęć: 1 = gdzie stanąć, 2 = gdzie celować, 3 = efekt.
- **Nowa mapa:** ✎ → *Mapy* → *+ Nowa mapa*. Podajesz nazwę, miniaturę i opcjonalnie obraz radaru, np. screenshot overview mapy.
- **Radar:** po dodaniu obrazu radaru do mapy w edytorze lineupu klikasz na nim cel (●) i miejsce rzutu (○). Na stronie mapy pojawi się przycisk *Widok radaru*.
- **Po zapisie** strona publiczna odświeża się w ok. 1 minutę (tyle trwa przebudowa GitHub Pages). Osoba zalogowana widzi zmiany od razu.
- **Kilka osób naraz:** każdy zapis pobiera najświeższą wersję `lineups.json` i nakłada tylko swoją zmianę, więc równoległe edycje się nie nadpisują.
- **Ulubione** zapisują się w przeglądarce, osobno na każdym urządzeniu.
- **☀ na karcie lineupu** blokuje wygaszanie ekranu telefonu (przydatne, gdy telefon leży obok monitora).

## Tryb lokalny (bez GitHuba)
W panelu logowania wybierz *Tryb lokalny*. Zmiany zapisują się w przeglądarce. Potem kliknij **Pobierz paczkę ZIP**, rozpakuj ją do katalogu repo (nadpisując `lineups.json`), usuń pliki wymienione w `DO_USUNIECIA.txt`, jeśli taki plik jest, i zrób commit. Na koniec kliknij **Odrzuć szkic**.

## Podgląd na własnym komputerze
Moduły JS nie działają z `file://`, więc uruchom mały serwer:
```
python -m http.server 8000
```
i otwórz `http://localhost:8000`. Zapis do GitHuba działa także stąd, jeśli `repo` jest wpisane w `config.json`.

## Format danych (`lineups.json`)
```json
{
  "maps": [{ "id": "mirage", "name": "Mirage", "order": 1, "areas": ["A","Mid","B"],
             "thumb": "images/mirage/_thumb-ab12c.webp", "radar": "images/mirage/_radar-x9y8z.webp" }],
  "lineups": [{
    "id": "mirage-smoke-window-k3x9", "map": "mirage",
    "grenade": "smoke | flash | molotov | he",
    "side": "T | CT | both", "area": "Mid", "title": "Smoke na Window",
    "throw": "lmb | jump | runjump | rmb | lmbrmb | crouch",
    "difficulty": "easy | medium | hard",
    "description": "…", "video": "https://youtu.be/…", "tags": ["window"],
    "images": [{ "src": "images/mirage/….webp", "caption": "opcjonalny podpis" }],
    "radar": { "target": { "x": 0.52, "y": 0.41 }, "from": { "x": 0.70, "y": 0.62 } },
    "author": "Kuba", "createdAt": "ISO", "updatedAt": "ISO"
  }]
}
```
Typy rzutów i granatów zmienisz w `assets/js/ui.js` (stałe `THROWS`, `GRENADES`).
