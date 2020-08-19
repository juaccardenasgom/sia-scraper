const puppeteer = require('puppeteer');
const fs = require('fs');
const courseTree = require("./tree");

function getSelection(inputLevel,inputCareer,inputLocation){
  for (const location in courseTree) {
    for(const level in courseTree[location]){
      for(const faculty in courseTree[location][level]){
        for(const career of courseTree[location][level][faculty]){
          if(career.includes(inputCareer)&&location.includes(inputLocation)&&level.includes(inputLevel)){
            return [level,faculty,career];
          }
        }
      }
    }
  }
}

async function getInfo(){
  // Init browser
  const browser = await puppeteer.launch({
    headless:true,
    ignoreHTTPSErrors:true,
    timeout:0,
    defaultViewport: {
      width: 1366,
      height: 768
    }
  });
  
  let response = {};

  // Set courseName to the course you want to search, it'll search for all non-elective courses
  const courseName = "";
  // You HAVE TO set selection, just fill it once with keywords, it's not necessary to write the whole word
  // Career and location MUST be in CAPITAL LETTERS.
  // EXAMPLES OF USAGE: [Pregrado|Doctorado|Postgrados y másteres,COMP|QUÍM|ADM|...,BOG|MEDELLÍN|PAZ|...]
  const selection = getSelection("Pregrado","SISTEMAS Y COMP","BOG");
  
  const selectIds = [`#pt1\\:r1\\:0\\:soc1\\:\\:content`,`#pt1\\:r1\\:0\\:soc2\\:\\:content`,`#pt1\\:r1\\:0\\:soc3\\:\\:content`];
  const url = 'https://sia.unal.edu.co/ServiciosApp/facespublico/public/servicioPublico.jsf?taskflowId=task-flow-AC_CatalogoAsignaturas';

  // Go to catalog
  const page = await browser.newPage();
  console.time("open");
  await page.goto(url,{
    timeout:0
  });
  console.timeEnd("open");

  // Select drop-list options
  for (const option of selection) {
    console.time(option);

    let selectionOptions = null;

    // Wait until options loaded
    switch(selection.indexOf(option)){
      case 0:
        selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc1::content").innerText);
        break;
      case 1:
        await page.waitForFunction(()=>!document.querySelector(`#pt1\\:r1\\:0\\:soc2\\:\\:content`).disabled,{
          timeout:0
        });
        selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc2::content").innerText);
        break;
      case 2: 
        await page.waitForFunction(()=>!document.querySelector(`#pt1\\:r1\\:0\\:soc3\\:\\:content`).disabled,{
          timeout:0
        });
        selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc3::content").innerText);
        break;
    }

    // Get available options
    selectionOptions = selectionOptions.split("\n");
    const selectValue = `${selectionOptions.indexOf(option)}`;

    // Select correct option
    const selectElement = await page.$(selectIds[selection.indexOf(option)]);
    await selectElement.click();
    selectElement.select(selectValue);

    console.timeEnd(option);
  }

  // Type course name
  await page.type(`#pt1\\:r1\\:0\\:it11\\:\\:content`,courseName);

  // Click button to execute search
  await page.waitForFunction(()=>!document.querySelector(".af_button.p_AFDisabled"));
  const button = await page.$(".af_button_link");
  button.click();

  // Wait for results to load
  await page.waitFor(6000);
  
  let courses = await page.$$(".af_commandLink");
  const size = courses.length-1;
  console.log(`${size} courses found!`);

  for (let i = 0; i < size; i++) {
    console.time(i);
    courses = await page.$$(".af_commandLink");

    // Visit 
    const element = courses[i];
    try{
      await element.click();
    }catch{
      console.error("Couldn't click on course link");
    }
    
    // Load course info
    try {
      await page.waitForSelector(".af_showDetailHeader_content0",{
        timeout: 3000,
      });

      // Get raw content
      const rawContent = await page.evaluate(() => document.querySelector('#d1').innerText);
    
      let regex = /(.*)\((.*)\)/,m;
      
      // Get course info
      const courseInfo = regex.exec(rawContent)[0].split(" (");
      const name = courseInfo[0];
      const code = courseInfo[1].replace(")","");

      // Init course
      let course = {
        name,
        groups: []
      };

      // Get group numbers
      regex = /\([0-9]*\)(.*)Grupo(.*)([0-9]*)(.*)+/g;
      do {
          m = regex.exec(rawContent);
          if (m) {
            course.groups.push({number: Number(m[0].substring(m[0].indexOf("(")+1,m[0].indexOf(")"))), name: m[0].split(") ")[1]});
          }
      } while (m);

      // Get professor
      regex = /Profesor:(.*)/g;
      for(const obj of course.groups){
        m = regex.exec(rawContent);
        if (m) {
          obj.professor = m[0].split("Profesor: ")[1];
        }
      }

      // Get seats
      regex = /Cupos disponibles:(.*)/g;
      for(const obj of course.groups){
        m = regex.exec(rawContent);
        if (m) {
          obj.seats = Number(m[0].split("Cupos disponibles: ")[1]);
        }
      }

      // Get schedule
      regex = /Fecha:(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)Duración:/g;
      for(const obj of course.groups){
        m = regex.exec(rawContent);
        if (m) {
          m[0] = m[0].replace(/(Fecha:(.*))|Duración/g,"").replace(/(SALA|SALON|SALÓN|LABORATORIO|AUDITORIO)(.*)/g,"@").replace(/\n|\./g,"").replace(/de |a |\:/g,"").split("@").filter(v => v.includes(" "));
          obj.schedule = m[0];
        }
      }

      // Save response
      response[`${code}`] = course
    }catch (e){
      console.log(`${i}: NO INFO FOUND!`);
      // console.error(e)
    }

    // Go back to course list
    // await page.waitForSelector(`.af_button`);
    const backButton = await page.$(`.af_button`);
    await backButton.click();

    try{
      await page.waitForSelector(".af_selectBooleanCheckbox_native-input",{
        timeout: 5000 
      });
    }catch{
      await backButton.click();
    }
    

    console.timeEnd(i);
  }

  // Log final file
  response = JSON.stringify(response,null,2);
  
  fs.writeFile('response.json', response, (err) => {
      if (err) throw err;
      console.log('Data written to file');
  });

  await browser.close();
}

getInfo();