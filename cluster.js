const { Cluster } = require("puppeteer-cluster");
const courseTree = require("./tree");
const fs = require("fs")

function getSelection (inputLevel,inputCareer,inputLocation){
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

async function main () {
  const workers = 18
  const url = 'https://sia.unal.edu.co/ServiciosApp/facespublico/public/servicioPublico.jsf?taskflowId=task-flow-AC_CatalogoAsignaturas';

  try{
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: workers,
        puppeteerOptions: {
          headless: true
        },
        timeout: 15*60000
    });

    await cluster.task(async function ({page, data:config}) {
        console.time(`${config.options.join("-").concat("#"+config.index)}${config.elective?"ELE":""}`)
        try{
          await page.goto(url,{timeout:0});
          const response = await getCourse(page,config);
          return response;
        } catch(err){
          console.error(err)
          return null;
        } finally {
          console.timeEnd(`${config.options.join("-").concat("#"+config.index)}${config.elective?"ELE":""}`)
        }
    });

    let courses = {}
    const options = ["Pre","ARTES","BOG"];
    let size = 75;
    const piece = Math.floor(size/workers)
    
    for(let i=0;i<workers;i++){
      cluster.execute({
        options,
        size: piece,
        index: i*piece,
        // elective: true
      }).then(data=>courses=Object.assign({},courses,data))
    }

    await cluster.idle();
    await cluster.close();

    fs.writeFile(`./outputs/${Date.now()}.json`, JSON.stringify(courses,null,2), (err) => {
        if (err) throw err;
        console.log(`Written!!!`);
    });
  } catch(err){
    console.error(err)
  }
}

async function getCourse(page,config){
  let response = {};
  const {options,index,elective,size} = config;
  const selection = getSelection(options[0],options[1],options[2]);

  if(elective){
    selection.push("LIBRE ELECCIÓN")
    selection.push("Por plan de estudios")
    selection.push("2CLE COMPONENTE DE LIBRE ELECCIÓN")
  }

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
  
  // Click button to execute search
  await page.waitForFunction(()=>!document.querySelector(".af_button.p_AFDisabled"),{timeout:0});
  await page.evaluate(`$(".af_button_link")[0].click()`)

  // Wait for loading course list
  await page.waitForFunction(()=>$("#pt1\\:r1\\:0\\:pb3").is(":visible"),{timeout:0});

  //TODO: Make an implementation for a list of indexes 

  for (let i = index; i < index+size; i++) {
    console.time(i)
    // Open course
    await page.evaluate(`$(".af_commandLink")[${i}].click()`)

    // Wait for course result
    await page.waitForFunction(()=>$(".detalle.af_panelBox").is(":visible"),{timeout: 0});

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

    const hasGroups = await page.evaluate(()=>$(".af_showDetailHeader_content0").length>0)
    if(hasGroups) {
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
          obj.professor = m[0].split("Profesor: ")[1].replace(".","");
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
      regex = /Fecha:(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)(\n*)(.*)Duración/g;
      for(const obj of course.groups){
        m = regex.exec(rawContent);
        if (m) {
          m[0] = m[0].replace(/(Fecha:(.*))|Duración/g,"").replace(/(AULA|SALA|SALON|SALÓN|Salón|LABORATORIO|AUDITORIO|AUD|Ofi)(.*)/g,"").replace(/\n/g,"").replace(/de |a |\:/g,"").split(".").filter(v => v.includes(" "));
          obj.schedule = m[0];
        }
      }
    }

    // Save response
    response[`${code}`] = course 

    // Go back to course list
    // await page.waitForSelector(`.af_button`);
    await page.evaluate(()=>$(".af_button").click())
    await page.waitForSelector(".af_selectBooleanCheckbox_native-input",{timeout: 0});
    console.timeEnd(i)
  }
  
  console.log(index,"done")
  return response;
}

main()