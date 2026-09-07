"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../autofill.js");
test("ordinary application field names and browser autocomplete map to a profile", () => {
  for (const [hints, expected] of [
    [["given-name"], "firstName"], [["02frstname"], "firstName"], [["first_name"], "firstName"],
    [["10address1"], "address1"], [["State / Province"], "state"], [["24emailadr"], "email"],
    [["organization-title"], "jobTitle"], [["66mm"], "birthMonth"], [["Field of study"], "fieldOfStudy"]
  ]) assert.equal(core.classify(hints), expected);
});
test("sensitive labels override otherwise familiar names", () => {
  for (const hints of [["name", "Card User Name"], ["fullName", "passport_number"], ["41ccnumber"], ["email", "username"], ["name", "Social Security Number"]]) assert.equal(core.classify(hints), null);
  assert.equal(core.classify(["Custom Message"]), null);
});
test("only known profile fields can be retained", () => {
  assert.deepEqual(core.sanitize({ firstName: " Alex ", password: "secret", ssn: "123", arbitrary: "data", email: 42 }), { firstName: "Alex" });
});
test("full name and split date values are derived without inventing details", () => {
  const profile = { firstName: "Alex", lastName: "Example", birthDate: "1994-08-17", phone: "5550100" };
  assert.equal(core.valueFor(profile, "fullName"), "Alex Example");
  assert.equal(core.valueFor(profile, "birthMonth"), "08");
  assert.equal(core.valueFor(profile, "birthYear"), "1994");
  assert.equal(core.valueFor(profile, "homePhone"), "5550100");
  assert.equal(core.valueFor(profile, "workPhone"), "");
});
test("numeric dropdown values stay distinct during matching", () => {
  assert.equal(core.norm('08'), '08');
  assert.notEqual(core.norm('08'), core.norm('09'));
});
test('real application label variants and date hints are recognized',()=>{
  for(const [label,key] of Object.entries({'Enter Your Full Name':'fullName','Given Name *':'firstName','First':'firstName','Last':'lastName','Email Id *':'email','Confirm your email':'email','Contact telephone number':'phone','Date of Birth (DD/MM/YYYY)*':'birthDate','Business name':'company','LinkedIn Profile Link':'linkedin','Country you live in':'country','Nationality':'nationality','Address town':'city','Address county':'county','GitHub URL':'github'}))assert.equal(core.classify([label]),key,label);
});
test('other people, credentials and unknown questions must not receive applicant data',()=>{
  for(const label of ['Emergency contact','Father name','Mother name','Spouse name','Reference contact','Hint answer','Login Id'])assert.equal(core.classify(['name',label]),null,label);
  for(const label of ['Work authorization','Salary expectations','Disability','Experience','Why this company?'])assert.equal(core.classify([label]),null,label);
});
test('new optional profile fields retain only explicit saved details',()=>{
  assert.deepEqual(core.sanitize({github:' https://example.com ',nationality:'Indian',county:'Example',location:'Pune',visa:'123'}),{github:'https://example.com',nationality:'Indian',location:'Pune',county:'Example'});
  assert.equal(core.valueFor({city:'Pune',state:'Maharashtra'},'location'),'Pune, Maharashtra');
  assert.equal(core.valueFor({country:'India'},'nationality'),'');
});
test('namespaced field hints and accented country names normalize consistently',()=>{
  for(const [hint,key]of Object.entries({'candidate[first_name]':'firstName','applicant.last_name':'lastName','profile.email':'email','contact[phone]':'phone'}))assert.equal(core.classify([hint]),key);
  assert.equal(core.norm('Côte d’Ivoire'),core.norm('Cote d Ivoire'));
});
test('only real calendar dates are retained',()=>{
  for(const date of ['1994-02-29','2024-02-30','1994-13-17','1994-00-17','17/08/1994'])assert.deepEqual(core.sanitize({birthDate:date}),{});
  assert.deepEqual(core.sanitize({birthDate:'2024-02-29'}),{birthDate:'2024-02-29'});
});
test('explicit country abbreviations expand without guessing nationality',()=>{
  for(const value of ['US','USA','United States of America'])assert.equal(core.countryName(value),'United States');
  assert.equal(core.countryName('UK'),'United Kingdom');assert.equal(core.countryName('IN'),'India');assert.equal(core.countryName('Indian'),'Indian');
});
