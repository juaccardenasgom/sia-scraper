# SIA scraper
Simple scraper for getting useful info on schedules, professors and seats. (Keep in mind that for large queries could take long)
## Installation
Clone the repo and install ```node_modules```.
## Usage
Run using ```npm start```, or in develop with ```npm run develop``` to run continuosly. Then set ```courseName``` to the course you want to search; it'll search for all non-elective courses otherwise.
```
  const courseName = "algoritmos";
```
After that, you *have to* set selection, just fill it once with keywords (or code), it's not necessary to write the whole word. Career and location **MUST be in CAPITAL LETTERS¨**.
```
*EXAMPLES OF USAGE*

Level: [Pre(grado)|Doc(torado)|Post(grados y másteres)]
Career: [2879|QUÍMICA|ECON|...]
Location: [BOG|1102|TUMACO|...]
```
Full detail of these configs can be found on ```tree.json``` file.