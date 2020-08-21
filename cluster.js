const { Cluster } = require("puppeteer-cluster")
const courseTree = require("./tree")

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
  try{
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 8,
        puppeteerOptions: {
            headless: false
        }
    });

    await cluster.task(async ({page, data: {options,index}}) => {
        console.time(index)
        await page.goto('https://sia.unal.edu.co/ServiciosApp/facespublico/public/servicioPublico.jsf?taskflowId=task-flow-AC_CatalogoAsignaturas');
        try{
          await initPage(page,options,index);
        } catch(err){
          console.error(err)
        }
        console.timeEnd(index)
    });

    const tics = cluster.queue({
      options: ["Pre","2879","BOG"],
      index: 4
    });

    const parallel = cluster.queue({
      options: ["Pre","2879","BOG"],
      index: 13
    });

    const languages = cluster.queue({
      options: ["Pre","2879","BOG"],
      index: 50
    });

    const optimization = cluster.queue({
      options: ["Pre","2879","BOG"],
      index: 57
    });

    await cluster.idle();
    await cluster.close();
  } catch(err){
    console.error(err)
  }
}

async function initPage(page,options,index){
  const selection = getSelection(options[0],options[1],options[2]);

  for (const option of selection) {
    const i = selection.indexOf(option);

    // Wait until options loaded
    await page.waitForFunction(i=>!$("#pt1\\:r1\\:0\\:soc"+(i+1)+"\\:\\:content").is(":disabled"),{timeout:0},i);
    
    // Get <select> text
    selectionOptions = await page.evaluate(`document.getElementById("pt1:r1:0:soc${i+1}::content").innerText`);
    selectionOptions = selectionOptions.split("\n");

    // Set <option> value
    const selectValue = `${selectionOptions.indexOf(option)}`;

    // Select <option>  
    try{
      const selectElement = await page.$(`#pt1\\:r1\\:0\\:soc${i+1}\\:\\:content`);
      await selectElement.click();
      await selectElement.select(selectValue);
    }catch(e){
      throw e
    }
  }
  
  // Click button to execute search
  await page.waitForFunction(()=>!document.querySelector(".af_button.p_AFDisabled"));
  await page.evaluate(`$(".af_button_link")[0].click()`)

  // Wait for results
  await page.waitForFunction(()=>$("#pt1\\:r1\\:0\\:pb3").is(":visible"),{timeout:0});

  await page.evaluate(`$(".af_commandLink")[${index}].click()`)
  await page.waitForFunction(()=>$(".detalle.af_panelBox").is(":visible"),{timeout: 0});

  const hasGroups = await page.evaluate(()=>$(".af_showDetailHeader_content0").length>0)
  if(!hasGroups) throw new Error("NoGroups")

  // Get raw content
  const rawContent = await page.evaluate(() => document.querySelector('#d1').innerText);
  // console.log(rawContent)
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
  // return course;
  console.log(course)
}

main()