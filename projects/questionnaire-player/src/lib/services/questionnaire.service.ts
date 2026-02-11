import { Injectable } from '@angular/core';
import { ValidatorFn, AbstractControl } from '@angular/forms';
import {
  Question,
  ResponseType,
  DisplayType,
  Evidence,
} from '../interfaces/questionnaire.type';

@Injectable({
  providedIn: 'root',
})
export class QuestionnaireService {
  private _submissionId: string;
  constructor() {}

  validate = (data: Question): ValidatorFn => {
    return (control: AbstractControl): { [key: string]: any } | null => {
      if (typeof data.validation == 'string') {
        return null;
      }
      
      // Validate phone number length (min: 10, max: 10) - check even if not required
      if (data.responseType === ResponseType.TEXT && 
          data.validation.IsNumber === 'true' &&
          data.validation.min !== undefined && data.validation.max !== undefined &&
          Number(data.validation.min) === 10 && Number(data.validation.max) === 10) {
        const phoneValue = String(control.value || '');
        if (phoneValue.length > 0 && phoneValue.length !== 10) {
          return { err: 'Phone number must be exactly 10 digits' };
        }
      }

      if (data.validation.regex) {
        const forbidden = this.testRegex(data.validation.regex, control.value || '');
        return forbidden ? null : { err: 'Invalid character found' };
      }

      if (data.validation.IsNumber) {
        // Validate that value is a number if provided (including 0)
        // Check if value exists (0 is a valid value, so we check for null, undefined, or empty string)
        if (control.value !== null && control.value !== undefined && control.value !== '') {
          const isNumber = !isNaN(control.value);
          if (!isNumber) {
            return { err: 'Only numbers allowed' };
          }
          
          // Validate number min value for number input fields
          if (data.responseType === ResponseType.NUMBER &&
              data.validation.min !== undefined && data.validation.min !== null && data.validation.min !== '') {
            const minValue = typeof data.validation.min === 'string' ? parseFloat(data.validation.min) : data.validation.min;
            if (Number(control.value) < minValue) {
              return { err: `Minimum value is ${minValue}` };
            }
          }
        }
      }

      if (data.validation.required) {
        // Check for empty arrays (FormArray case)
        if (Array.isArray(control.value)) {
          if (data.responseType == ResponseType.MULTISELECT) {
            return control.value.some((v) => v != '')
              ? null
              : { err: 'Select at least one option' };
          }
          if ((data.displayType == DisplayType.ENTITY_DROPDOWN || (data.responseType as string) == 'entity-dropdown') && data.entityConfig?.multiSelect) {
            // Entity dropdown with multi-select uses FormArray
            return control.value.some((v) => v != '' && v != null && v != undefined)
              ? null
              : { err: 'Select at least one option' };
          }
          // Empty array for other types
          if (control.value.length === 0) {
            return { err: 'Required field' };
          }
        }
        
        // Check for required field - handle 0 as valid value
        if (control.value === null || control.value === undefined || control.value === '') {
          return { err: 'Required field' };
        }

        if (data.responseType == ResponseType.SLIDER) {
          let min = data.validation.min;
          let max = data.validation.max;
          return min <= control.value && control.value <= max
            ? null
            : { err: 'Selected value not within range' };
        }
      }
    };
  };

  testRegex(regexExpression: RegExp, value: string): boolean {
    const regex = new RegExp(regexExpression);
    return regex.test(value);
  }

  setSubmissionId(submissionId: any) {
    this._submissionId = submissionId;
  }

  getSubmissionId() {
    return this._submissionId;
  }

  mapSubmissionToAssessment(data) {
    const assessment = data.assessment;

    for (const evidence of assessment.evidences) {
      const validSubmission = assessment.submissions[evidence?.externalId];
      if (validSubmission) {
        evidence.notApplicable = validSubmission.notApplicable;
        if (evidence?.notApplicable) {
          continue;
        }

        for (const section of evidence?.sections) {
          for (const question of section.questions) {
            if (question.responseType === 'pageQuestions') {
              for (const questions of question.pageQuestions) {
                if (
                  validSubmission.answers &&
                  validSubmission.answers[questions._id]
                ) {
                  questions.value =
                    questions.responseType !== 'matrix'
                      ? validSubmission.answers[questions._id].value
                      : this.constructMatrixValue(
                          validSubmission,
                          questions,
                          evidence?.externalId
                        );
                  questions.remarks = validSubmission.answers[questions._id]
                    ? validSubmission.answers[questions._id].remarks
                    : '';
                  questions.fileName = validSubmission.answers[questions._id]
                    ? validSubmission.answers[questions._id].fileName
                    : [];
                  questions.endTime = validSubmission.answers[questions._id]
                    ? validSubmission.answers[questions._id].endTime
                    : '';
                }
              }
            } else if (
              validSubmission.answers &&
              validSubmission.answers[question._id]
            ) {
              question.value =
                question.responseType !== 'matrix'
                  ? validSubmission.answers[question._id].value
                  : this.constructMatrixValue(
                      validSubmission,
                      question,
                      evidence?.externalId
                    );
              question.remarks = validSubmission.answers[question._id]
                ? validSubmission.answers[question._id].remarks
                : '';
              question.fileName = validSubmission.answers[question._id]
                ? validSubmission.answers[question._id].fileName
                : [];
              question.endTime = validSubmission.answers[question._id]
                ? validSubmission.answers[question._id].endTime
                : '';
            }
          }
        }
      }
    }

    this.setSubmissionId(assessment.submissionId);
    return data;
  }

  constructMatrixValue(validSubmission, matrixQuestion, ecmId) {
    matrixQuestion.value = [];
    if (
      validSubmission.answers &&
      validSubmission.answers[matrixQuestion._id] &&
      validSubmission.answers[matrixQuestion._id].value
    ) {
      for (const answer of validSubmission.answers[matrixQuestion._id].value) {
        matrixQuestion.value.push(
          JSON.parse(JSON.stringify(matrixQuestion.instanceQuestions))
        );
      }
      matrixQuestion.value.forEach((instance, index) => {
        instance.forEach((question, instanceIndex) => {
          if (
            validSubmission.answers[matrixQuestion._id] &&
            validSubmission.answers[matrixQuestion._id].value[index][
              question._id
            ]
          ) {
            question.value =
              validSubmission.answers[matrixQuestion._id].value[index][
                question._id
              ].value;
            question.remarks =
              validSubmission.answers[matrixQuestion._id].value[index][
                question._id
              ].remarks;
            question.fileName =
              validSubmission.answers[matrixQuestion._id].value[index][
                question._id
              ].fileName;
            question.endTime =
              validSubmission.answers[matrixQuestion._id].value[index][
                question._id
              ].endTime;
          }
        });
      });
      return matrixQuestion.value;
    } else {
      return [];
    }
  }

  getEvidenceData(evidence: Evidence, formValues: object) {
    // Validate evidence parameter
    if (!evidence) {
      return {
        externalId: null,
        answers: {},
        startTime: null,
        endTime: Date.now(),
        isSubmitted: false
      };
    }
    
    let sections = evidence?.sections;
    let answers = this.getSectionData(sections, formValues);
    let payloadData = {
      externalId: evidence?.externalId,
      answers: answers,
      startTime: evidence?.startTime,
      endTime: Date.now(),
      isSubmitted: evidence?.isSubmitted
    };
    return payloadData;
  }

  getSectionData(sections, formValues) {
    let answers = {};
    // Validate sections parameter
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return answers;
    }
    for (let index = 0; index < sections.length; index++) {
      if (sections[index] && sections[index].questions) {
        answers = {
          ...answers,
          ...this.createpayload(sections[index].questions, formValues),
        };
      }
    }
    return answers;
  }

  createpayload(questions, formValues) {
    let answers = {};
    // Validate questions parameter
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return answers;
    }
    for (let index = 0; index < questions.length; index++) {
      let currentQuestion = questions[index];
      if (currentQuestion.responseType == 'pageQuestions') {
        answers = {
          ...answers,
          ...this.createpayload(currentQuestion.pageQuestions, formValues),
        };
        continue;
      }
      if (currentQuestion.responseType == 'matrix') {
        for (let index = 0; index < currentQuestion.value.length; index++) {
          formValues[currentQuestion._id][index] = this.createpayload(
            currentQuestion.value[index],
            formValues[currentQuestion._id][index]
          );
        }
      }

      let perQuestionData = this.formatToPayload(currentQuestion, formValues);
      answers[currentQuestion._id] = perQuestionData;
    }

    return answers;
  }

  formatToPayload(currentQuestion, formValues) {
    let value, labels;
  
    if (currentQuestion.responseType === 'matrix') {
      value = !currentQuestion.value?.length
        ? []
        : formValues[currentQuestion._id];
      labels = currentQuestion.value || [];
    } else {
      value = formValues[currentQuestion._id];
      labels = formValues[currentQuestion._id];
  
      if (currentQuestion.responseType === 'radio' && currentQuestion.value) {
        const selectedOption = currentQuestion.options.find(
          (_) => _.value === currentQuestion.value
        );
        labels = selectedOption ? selectedOption.label : '';
      }
  
      if (currentQuestion.responseType === 'multiselect') {
        const selectedValues = Array.isArray(currentQuestion.value)
          ? currentQuestion.value
          : currentQuestion.value
          ? [currentQuestion.value]
          : [];
  
        labels = currentQuestion.options
          .filter((opt) => selectedValues.includes(opt.value))
          .map((opt) => opt.label);
      }
    }
  
    let payloadItem = {
      qid: currentQuestion._id,
      value: value,
      remarks: currentQuestion.remarks,
      fileName: currentQuestion.fileName,
      gpsLocation: '',
      payload: {
        question: currentQuestion.question,
        labels: this.convertToArray(labels), // always returns array
        responseType: currentQuestion.responseType,
        filesNotUploaded: [], //todo
      },
      startTime: currentQuestion.startTime,
      endTime: currentQuestion.endTime,
      criteriaId: currentQuestion.payload.criteriaId,
      responseType: currentQuestion.responseType,
      evidenceMethod: currentQuestion.evidenceMethod,
      visibleIf: currentQuestion.visibleIf,
      rubricLevel: '',
    };
  
    // 🔹 Flatten extra nested "value" if it’s an object with a "value" key
    while (
      payloadItem?.value &&
      typeof payloadItem.value === 'object' &&
      !Array.isArray(payloadItem.value) &&
      'value' in payloadItem.value
    ) {
      payloadItem.value = payloadItem.value.value;
    }
  
    return payloadItem;
  }
  
  

  convertToArray(arr) {
    if (!arr) {
      return arr;
    }
    let clonedArr = structuredClone(arr);
    if (Array.isArray(clonedArr)) {
      return arr;
    } else {
      return [clonedArr];
    }
  }
}
