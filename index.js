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

async function getAll(){
  for (const location in courseTree) {
    for(const level in courseTree[location]){
      for(const faculty in courseTree[location][level]){
        for(const career of courseTree[location][level][faculty]){
          await getInfo([level,faculty,career])
        }
      }
    }
  }
}

async function getInfo(){
  // Init browser
  const browser = await puppeteer.launch({
    headless:true,
    timeout:0,
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });
  
  let response = {};

  // Set courseName to the course you want to search, it'll search for all non-elective courses
  const courseName = "";
  // You HAVE TO set selection, just fill it once with keywords, it's not necessary to write the whole word
  // Career and location MUST be in CAPITAL LETTERS.
  // EXAMPLES OF USAGE: [Pregrado|Doctorado|Postgrados y másteres,COMP|QUÍM|ADM|...,BOG|MEDELLÍN|PAZ|...]
  const selection = getSelection("Pre","2879","BOG");
  const searchElectives = true;
  
  if(searchElectives){
    selection.push("LIBRE ELECCIÓN")
    selection.push("Por plan de estudios")
    selection.push("2CLE COMPONENTE DE LIBRE ELECCIÓN")
  }
  
  // const selection = info
  
  const selectIds = [`#pt1\\:r1\\:0\\:soc1\\:\\:content`,`#pt1\\:r1\\:0\\:soc2\\:\\:content`,`#pt1\\:r1\\:0\\:soc3\\:\\:content`,
  `#pt1\\:r1\\:0\\:soc4\\:\\:content`,`#pt1\\:r1\\:0\\:soc5\\:\\:content`,`#pt1\\:r1\\:0\\:soc8\\:\\:content`];
  const url = 'https://sia.unal.edu.co/ServiciosApp/facespublico/public/servicioPublico.jsf?taskflowId=task-flow-AC_CatalogoAsignaturas';

  // Go to catalog
  const page = await browser.newPage();
  console.time("open");
  await page.goto(url,{
    timeout:0,
    waitUntil: "networkidle2",
    referer:url
  });
  console.timeEnd("open");

  // Select drop-list options
  for (const option of selection) {
    const i = selection.indexOf(option);

    // Wait until options loaded
    await page.waitForFunction(i=>i<=3?!$("#pt1\\:r1\\:0\\:soc"+`${i<5?i+1:8}`+"\\:\\:content").is(":disabled"):$("#pt1\\:r1\\:0\\:soc"+`${i<5?i+1:8}`+"\\:\\:content").is(":visible"),{timeout:0},i);
    
    // Get <select> text
    selectionOptions = await page.evaluate(`document.getElementById("pt1:r1:0:soc${i<5?i+1:8}::content").innerText`);
    selectionOptions = selectionOptions.split("\n");

    // Set <option> value
    const selectValue = `${selectionOptions.indexOf(option)}`;

    // Select <option>  
    try{
      const selectElement = await page.$(`#pt1\\:r1\\:0\\:soc${i<5?i+1:8}\\:\\:content`);
      await selectElement.click();
      await selectElement.select(selectValue);
    }catch(e){
      throw e
    }
  }

  // Type course name
  if(courseName){
    console.time(courseName)
    await page.type(`#pt1\\:r1\\:0\\:it11\\:\\:content`,courseName);
    console.timeEnd(courseName)
  }

  // Click button to execute search
  await page.waitForFunction(()=>!document.querySelector(".af_button.p_AFDisabled"));
  await page.evaluate(`$(".af_button_link")[0].click()`)

  // Wait for results to load
  console.time("Results")
  await page.waitForFunction(()=>$("#pt1\\:r1\\:0\\:pb3").is(":visible"),{
    timeout:0
  });
  console.timeEnd("Results")
  
  let courses = await page.$$(".af_commandLink");
  const size = courses.length-1;
  console.log(`${size} course${size>2?"s":""} found!`);

  for (let i = 0; i < size; i++) {
    console.time(i);
    courses = await page.$$(".af_commandLink");

    // Visit 
    // const element = courses[i];
    try{
      // await page.evaluate(i=>document.getElementsByClassName("af_commandLink")[i].click(),i)
      await courses[i].click()
    }catch{
      console.error("Couldn't click on course link");
    }
    
    // Load course info
    try {
      await page.waitForFunction(()=>$(".detalle.af_panelBox").is(":visible"),{
        timeout: 0,
      });
      const hasGroups = await page.evaluate(()=>$(".af_showDetailHeader_content0").length>0)
      if(!hasGroups) throw new Error("NoGroups")

      // Get raw content
      const rawContent = await page.evaluate(() => document.querySelector('#d1').innerText);
    
      let regex = /(.*)\((.*)\)/,m;
      
      // Get course info
      const courseInfo = regex.exec(rawContent)[0].split(" (");
      const name = courseInfo[0];
      const code = courseInfo[1].replace(")","");

      // Get credits
      regex = /Créditos:(.*)/g
      const credits = Number(regex.exec(rawContent)[0].split("Créditos:")[1])

      // Init course
      let course = {
        name,
        credits,
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
          m[0] = m[0].replace(/(Fecha:(.*))|Duración/g,"").replace(/(AULA|SALA|SALON|SALÓN|Salón|LABORATORIO|AUDITORIO|AUD|Ofi)(.*)/g,"@").replace(/\n|\./g,"").replace(/de |a |\:/g,"").split("@").filter(v => v.includes(" "));
          obj.schedule = m[0];
        }
      }

      // Save response
      response[`${code}`] = course
    }catch (e){
      // console.log(`${i}: NO INFO FOUND!`);
      // console.error(e)
    }

    // Go back to course list
    await page.waitForSelector(`.af_button`);
    await page.evaluate(()=>$(".af_button").click())

    try{
      await page.waitForSelector(".af_selectBooleanCheckbox_native-input",{
        timeout: 0
      });
    }catch{
      console.log("CAN'TGOBACK")
    }
    
    console.timeEnd(i);
  }

  // Log final file
  response = JSON.stringify(response,null,2);
  
  fs.writeFile(`${new Date().toString().replace(/:| |-|\(|\)/g,"")}.json`, response, (err) => {
      if (err) throw err;
      console.log(`DONE: ${selection[1]}`);
  });

  await browser.close();
}

// getAll();
getInfo()

async function initBrowser(config){
  const { selection, url } = config

  // Instantiate browser
  const browser = await puppeteer.launch({
    headless:false,
    timeout:0,
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });

  const page = await browser.newPage();

  // Go to URL
  await page.goto(url,{
    timeout:0,
    waitUntil: "networkidle2",
    referer:url
  });

  // Select drop-list options
  for (const option of selection) {
    console.time(option);

    // Wait until options loaded  
    const i = selection.indexOf(option)

    await page.waitForFunction(`${i>4?"":"!"}$("#pt1\\:r1\\:0\\:soc${i}\\:\\:content").is(":${i>4?"visible":"disabled"}")`,{
      timeout:0
    });


    // switch(selection.indexOf(option)){
    //   case 0:
    //     selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc1::content").innerText);
    //     break;
    //   case 1:
    //     await page.waitForFunction(()=>!document.querySelector(`#pt1\\:r1\\:0\\:soc2\\:\\:content`).disabled,{
    //       timeout:0
    //     });
    //     selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc2::content").innerText);
    //     break;
    //   case 2: 
    //     await page.waitForFunction(()=>!document.querySelector(`#pt1\\:r1\\:0\\:soc3\\:\\:content`).disabled,{
    //       timeout:0
    //     });
    //     selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc3::content").innerText);
    //     break;
    //   case 3: 
    //     await page.waitForFunction(()=>!$("#pt1\\:r1\\:0\\:soc4\\:\\:content").is(":disabled"));
    //     selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc4::content").innerText);
    //     break;
    //   case 4: 
    //     await page.waitForFunction(()=>$("#pt1\\:r1\\:0\\:soc5\\:\\:content").is(":visible"));
    //     selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc5::content").innerText);
    //     break;
    //   case 5: 
    //     await page.waitForFunction(()=>$("#pt1\\:r1\\:0\\:soc8\\:\\:content").is(":visible"));
    //     selectionOptions = await page.evaluate(()=>document.getElementById("pt1:r1:0:soc8::content").innerText);
    //     break;
    // }

    // 
    let selectionOptions = await page.evaluate(`document.getElementById("pt1:r1:0:soc${i!=5?i+1:8}::content").innerText`);
    selectionOptions = selectionOptions.split("\n")

    // Get available options
    const selectValue = `${selectionOptions.indexOf(option)}`;

    // Select correct option
    try{
      const selectElement = await page.$(selectIds[i]);
      await selectElement.click();
      
      selectElement.select(selectValue);
    }catch(e){
      console.log(e)
    }

    console.timeEnd(option);
  }

  await browser.close();

}

initBrowser({
  selection: getSelection("Pregrado","SISTEMAS Y COMP","BOG"),
  url: 'https://sia.unal.edu.co/ServiciosApp/facespublico/public/servicioPublico.jsf?taskflowId=task-flow-AC_CatalogoAsignaturas'
})